import os
import json
import math
import numpy as np
import faiss
from datetime import datetime, timezone
from typing import Optional

# Freshness decay: items lose 50% of their freshness bonus after this many days
FRESHNESS_HALFLIFE_DAYS = 30
FRESHNESS_WEIGHT = 0.05  # max freshness bonus (5% of score)

INDEX_DIR = os.environ.get('FAISS_INDEX_DIR', '/data/faiss_index')
INDEX_FILE = os.path.join(INDEX_DIR, 'wardrobe.index')
META_FILE = os.path.join(INDEX_DIR, 'wardrobe_meta.json')
DIM = 512  # FashionCLIP (patrickjohncyh/fashion-clip) projection_dim

# Auto-upgrade: use IVF when index exceeds this threshold
IVF_THRESHOLD = 50_000
IVF_NLIST = 100      # number of Voronoi cells
IVF_NPROBE = 10      # cells to search at query time (tradeoff: speed vs recall)

import logging
logger = logging.getLogger(__name__)


def _freshness_boost(created_at_str: str) -> float:
    """Compute freshness boost ∈ [0, FRESHNESS_WEIGHT] via exponential decay."""
    if not created_at_str:
        return 0.0
    try:
        dt = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400
        decay = math.exp(-0.693 * age_days / FRESHNESS_HALFLIFE_DAYS)  # 0.693 = ln(2)
        return FRESHNESS_WEIGHT * decay
    except (ValueError, TypeError):
        return 0.0


class FAISSIndexService:
    def __init__(self):
        self.index: Optional[faiss.Index] = None
        self.meta: list = []
        self._load_if_exists()

    def _load_if_exists(self):
        if os.path.exists(INDEX_FILE) and os.path.exists(META_FILE):
            self.index = faiss.read_index(INDEX_FILE)
            # Restore nprobe for IVF indices
            if hasattr(self.index, 'nprobe'):
                self.index.nprobe = IVF_NPROBE
            with open(META_FILE, 'r') as f:
                self.meta = json.load(f)

    @property
    def index_type(self) -> str:
        if self.index is None:
            return "none"
        if hasattr(self.index, 'nprobe'):
            return "IVFFlat"
        return "FlatIP"

    def build(self, items: list) -> int:
        embeddings = []
        self.meta = []
        for item in items:
            emb = item.get('embedding')
            if emb is None:
                continue
            vec = np.array(emb, dtype=np.float32)
            if vec.shape[0] != DIM:
                continue
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            embeddings.append(vec)
            self.meta.append({
                'id': item.get('id'),
                'name': item.get('item_name') or item.get('name'),
                'image_url': item.get('image_url'),
                'clothing_type': item.get('clothing_type'),
                'color': item.get('color'),
                'created_at': str(item.get('created_at', '')),
            })
        if not embeddings:
            return 0
        matrix = np.stack(embeddings)
        n = len(embeddings)

        if n >= IVF_THRESHOLD:
            # Large index: use IVF for O(n/nlist) search instead of O(n)
            nlist = min(IVF_NLIST, n // 40)  # at least 40 vectors per cell
            quantizer = faiss.IndexFlatIP(DIM)
            self.index = faiss.IndexIVFFlat(quantizer, DIM, nlist, faiss.METRIC_INNER_PRODUCT)
            self.index.train(matrix)
            self.index.add(matrix)
            self.index.nprobe = IVF_NPROBE
            logger.info(f"[FAISS] Built IndexIVFFlat: {n} vectors, {nlist} cells, nprobe={IVF_NPROBE}")
        else:
            # Small index: brute-force is fast enough
            self.index = faiss.IndexFlatIP(DIM)
            self.index.add(matrix)
            logger.info(f"[FAISS] Built IndexFlatIP: {n} vectors")

        self._save()
        return n

    def _save(self):
        os.makedirs(INDEX_DIR, exist_ok=True)
        faiss.write_index(self.index, INDEX_FILE)
        with open(META_FILE, 'w') as f:
            json.dump(self.meta, f)

    def add(self, item_id: int, embedding: list, meta: dict):
        vec = np.array(embedding, dtype=np.float32).reshape(1, -1)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        if self.index is None:
            self.index = faiss.IndexFlatIP(DIM)
        self.index.add(vec)
        self.meta.append({'id': item_id, **meta})
        self._save()

    def search(self, query_emb: np.ndarray, k: int = 20, apply_mmr: bool = True, mmr_diversity: float = 0.3) -> list:
        """Similarity search with optional MMR diversity re-ranking.

        Without MMR, raw nearest-neighbors are homogeneous — 50 black t-shirts
        from a wardrobe full of black t-shirts. MMR penalizes candidates too
        similar to already-picked ones, giving the user variety within style.
        """
        if self.index is None or self.index.ntotal == 0:
            return []
        vec = query_emb.reshape(1, -1).astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        # Fetch 3x candidates when MMR is active, so re-ranking has room to work.
        fetch_k = min(k * 3, self.index.ntotal) if apply_mmr else min(k, self.index.ntotal)
        scores, indices = self.index.search(vec, fetch_k)

        valid_indices = [(i, int(idx)) for i, (_, idx) in enumerate(zip(scores[0], indices[0]))
                         if 0 <= idx < len(self.meta)]

        candidate_vecs = None
        if apply_mmr and valid_indices:
            faiss_idxs = [fi for _, fi in valid_indices]
            candidate_vecs = np.stack([self.index.reconstruct(fi) for fi in faiss_idxs])

        candidates = []
        vec_pos = 0
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.meta):
                continue
            meta = self.meta[idx]
            final_score = float(score) + _freshness_boost(meta.get('created_at', ''))
            item = {**meta, 'score': final_score}
            if apply_mmr:
                item['_vec_idx'] = vec_pos
            vec_pos += 1
            candidates.append(item)

        candidates.sort(key=lambda x: x['score'], reverse=True)

        if apply_mmr and candidate_vecs is not None and len(candidates) > k:
            candidates = self._mmr_rerank(candidates, candidate_vecs, k, diversity=mmr_diversity)

        for c in candidates[:k]:
            c.pop('_vec_idx', None)
        return candidates[:k]

    def search_with_penalties(
        self,
        query_emb: np.ndarray,
        k: int = 20,
        dislike_emb: np.ndarray | None = None,
        dislike_weight: float = 0.3,
        cluster_dislike_emb: np.ndarray | None = None,
        cluster_weight: float = 0.15,
        exclude_ids: set | None = None,
    ) -> list:
        """Search with anti-preference penalty vectors.

        Fetches 3×k candidates from FAISS, computes penalty scores against
        dislike and cluster-dislike mean embeddings, re-ranks, and returns top-k.
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        vec = query_emb.reshape(1, -1).astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        # Fetch extra candidates for re-ranking
        fetch_k = min(k * 3, self.index.ntotal)
        scores, indices = self.index.search(vec, fetch_k)

        # Pre-compute penalty vectors
        d_vec = None
        if dislike_emb is not None:
            d_vec = dislike_emb.reshape(1, -1).astype(np.float32)
            d_norm = np.linalg.norm(d_vec)
            if d_norm > 0:
                d_vec = d_vec / d_norm

        c_vec = None
        if cluster_dislike_emb is not None:
            c_vec = cluster_dislike_emb.reshape(1, -1).astype(np.float32)
            c_norm = np.linalg.norm(c_vec)
            if c_norm > 0:
                c_vec = c_vec / c_norm

        # Batch-reconstruct all candidate vectors at once — needed for both
        # the penalty math and MMR diversity re-ranking.
        need_penalty = d_vec is not None or c_vec is not None
        candidate_vecs = None
        valid_indices = [(i, int(idx)) for i, (_, idx) in enumerate(zip(scores[0], indices[0]))
                         if 0 <= idx < len(self.meta)]
        if valid_indices:
            faiss_idxs = [fi for _, fi in valid_indices]
            candidate_vecs = np.stack([self.index.reconstruct(fi) for fi in faiss_idxs])

        candidates = []
        vec_pos = 0
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.meta):
                continue
            meta = self.meta[idx]
            item_id = meta.get('id')

            # Hard-exclude directly disliked items
            if exclude_ids and item_id in exclude_ids:
                vec_pos += 1
                continue

            final_score = float(score) + _freshness_boost(meta.get('created_at', ''))

            # Multiplicative penalty: score *= (1 - weight × sim)
            # Keeps scores in [0, original_score], never goes negative
            if need_penalty and candidate_vecs is not None:
                item_vec = candidate_vecs[vec_pos].reshape(1, -1)

                if d_vec is not None:
                    dislike_sim = max(0.0, float(np.dot(d_vec, item_vec.T)[0, 0]))
                    final_score *= (1.0 - dislike_weight * dislike_sim)

                if c_vec is not None:
                    cluster_sim = max(0.0, float(np.dot(c_vec, item_vec.T)[0, 0]))
                    final_score *= (1.0 - cluster_weight * cluster_sim)

            vec_pos += 1
            candidates.append({**meta, 'score': final_score, '_vec_idx': vec_pos - 1})

        # Sort by final score descending
        candidates.sort(key=lambda x: x['score'], reverse=True)

        # MMR diversity re-ranking — apply unconditionally so a dislike-free
        # user still gets varied results instead of 50 clones of their mean.
        if candidate_vecs is not None and len(candidates) > k:
            candidates = self._mmr_rerank(candidates, candidate_vecs, k, diversity=0.3)

        # Clean up internal fields
        for c in candidates[:k]:
            c.pop('_vec_idx', None)
        return candidates[:k]

    def _mmr_rerank(
        self, candidates: list, all_vecs: np.ndarray, k: int, diversity: float = 0.3,
    ) -> list:
        """Maximal Marginal Relevance re-ranking for diversity.

        Iteratively selects items that balance relevance and diversity.
        diversity=0 → pure relevance, diversity=1 → pure diversity.
        """
        if len(candidates) <= k:
            return candidates

        selected = [candidates[0]]
        remaining = list(candidates[1:])

        for _ in range(k - 1):
            if not remaining:
                break

            best_score = -1.0
            best_idx = 0

            for i, cand in enumerate(remaining):
                relevance = cand['score']
                # Max similarity to already selected items
                cand_vec_idx = cand.get('_vec_idx')
                if cand_vec_idx is not None and cand_vec_idx < len(all_vecs):
                    cand_vec = all_vecs[cand_vec_idx].reshape(1, -1)
                    max_sim = 0.0
                    for sel in selected:
                        sel_vec_idx = sel.get('_vec_idx')
                        if sel_vec_idx is not None and sel_vec_idx < len(all_vecs):
                            sel_vec = all_vecs[sel_vec_idx].reshape(1, -1)
                            sim = float(np.dot(cand_vec, sel_vec.T)[0, 0])
                            max_sim = max(max_sim, sim)
                    mmr_score = (1 - diversity) * relevance - diversity * max_sim
                else:
                    mmr_score = relevance

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = i

            selected.append(remaining.pop(best_idx))

        return selected

    @property
    def size(self) -> int:
        return self.index.ntotal if self.index else 0
