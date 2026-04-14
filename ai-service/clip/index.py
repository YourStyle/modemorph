import os
import json
import numpy as np
import faiss
from typing import Optional

INDEX_DIR = os.environ.get('FAISS_INDEX_DIR', '/data/faiss_index')
INDEX_FILE = os.path.join(INDEX_DIR, 'wardrobe.index')
META_FILE = os.path.join(INDEX_DIR, 'wardrobe_meta.json')
DIM = 512  # FashionCLIP (patrickjohncyh/fashion-clip) projection_dim


class FAISSIndexService:
    def __init__(self):
        self.index: Optional[faiss.IndexFlatIP] = None
        self.meta: list = []
        self._load_if_exists()

    def _load_if_exists(self):
        if os.path.exists(INDEX_FILE) and os.path.exists(META_FILE):
            self.index = faiss.read_index(INDEX_FILE)
            with open(META_FILE, 'r') as f:
                self.meta = json.load(f)

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
            })
        if not embeddings:
            return 0
        matrix = np.stack(embeddings)
        self.index = faiss.IndexFlatIP(DIM)
        self.index.add(matrix)
        self._save()
        return len(embeddings)

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

    def search(self, query_emb: np.ndarray, k: int = 20) -> list:
        if self.index is None or self.index.ntotal == 0:
            return []
        vec = query_emb.reshape(1, -1).astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        k = min(k, self.index.ntotal)
        scores, indices = self.index.search(vec, k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.meta):
                continue
            results.append({**self.meta[idx], 'score': float(score)})
        return results

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

        candidates = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.meta):
                continue
            meta = self.meta[idx]
            item_id = meta.get('id')

            # Hard-exclude directly disliked items
            if exclude_ids and item_id in exclude_ids:
                continue

            final_score = float(score)

            # Apply penalties via dot product with the indexed vector
            if d_vec is not None or c_vec is not None:
                # Retrieve the item's vector from FAISS
                item_vec = self.index.reconstruct(int(idx)).reshape(1, -1)

                if d_vec is not None:
                    dislike_sim = float(np.dot(d_vec, item_vec.T)[0, 0])
                    # Only penalize positive similarity (item looks like disliked items)
                    if dislike_sim > 0:
                        final_score -= dislike_weight * dislike_sim

                if c_vec is not None:
                    cluster_sim = float(np.dot(c_vec, item_vec.T)[0, 0])
                    if cluster_sim > 0:
                        final_score -= cluster_weight * cluster_sim

            candidates.append({**meta, 'score': final_score})

        # Sort by final score descending
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[:k]

    @property
    def size(self) -> int:
        return self.index.ntotal if self.index else 0
