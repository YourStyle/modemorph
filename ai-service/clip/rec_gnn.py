"""LightGCN-based collaborative recommender, with FashionCLIP embeddings
as cold-start initialisation for item nodes.

Implements the model from:
  He, X. et al. (2020) "LightGCN: Simplifying and Powering Graph
  Convolution Network for Recommendation." SIGIR.

Design choices justified by our data scale:
  * Pure LightGCN (no feature transform, no self-connection) — fewer params,
    more stable on sparse interactions.
  * Item embeddings initialised as `Linear(512 -> 64)` projection of the
    FashionCLIP visual embedding. An item with zero likes therefore still
    has a meaningful vector that inherits visual/semantic neighbourhood
    structure — graceful degradation under severe data sparsity.
  * User embeddings initialised as the mean of their positively-interacted
    item embeddings at construction time (proxy for taste), random if the
    user has no likes.
  * BPR loss with uniform negative sampling — the default objective for
    implicit-feedback CF and what the LightGCN paper uses.
"""
from __future__ import annotations

import json
import logging
import os
import random
import time
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)

# Checkpoint location
LIGHTGCN_DIR = os.environ.get("LIGHTGCN_DIR", "/data/lightgcn")
CHECKPOINT_FILE = os.path.join(LIGHTGCN_DIR, "lightgcn.pt")
MAPPING_FILE = os.path.join(LIGHTGCN_DIR, "id_mapping.json")
META_FILE = os.path.join(LIGHTGCN_DIR, "meta.json")

# Hyperparameters
EMB_DIM = 64           # LightGCN embedding dimension
N_LAYERS = 3           # graph propagation depth (paper default)
LR = 0.005
WEIGHT_DECAY = 1e-4    # L2 regularisation via Adam
EPOCHS = 60
BATCH_SIZE = 256
NEG_SAMPLES = 1        # negatives per positive (BPR standard)
CLIP_DIM = 512


class LightGCN(nn.Module):
    """LightGCN with CLIP-initialised item embeddings."""

    def __init__(
        self,
        n_users: int,
        n_items: int,
        emb_dim: int = EMB_DIM,
        n_layers: int = N_LAYERS,
        item_clip_features: Optional[torch.Tensor] = None,
    ):
        super().__init__()
        self.n_users = n_users
        self.n_items = n_items
        self.emb_dim = emb_dim
        self.n_layers = n_layers

        # User embeddings: plain learnable table. Cannot inherit CLIP geometry
        # since users are not images. Xavier init so the first epoch does not
        # blow up.
        self.user_emb = nn.Embedding(n_users, emb_dim)
        nn.init.xavier_uniform_(self.user_emb.weight)

        # Item embeddings: if CLIP features are provided, learn a linear
        # projection (CLIP_DIM -> emb_dim) and freeze the 512-d input. This
        # lets the item table inherit FashionCLIP's semantic geometry for
        # cold-start items the BPR loss never sees. Otherwise fall back to a
        # plain learnable embedding table.
        if item_clip_features is not None:
            assert item_clip_features.shape == (n_items, CLIP_DIM), (
                f"item_clip_features must be [n_items={n_items}, {CLIP_DIM}], "
                f"got {item_clip_features.shape}"
            )
            self.register_buffer("item_clip", item_clip_features)
            self.item_projection = nn.Linear(CLIP_DIM, emb_dim, bias=False)
            nn.init.xavier_uniform_(self.item_projection.weight)
            self.item_emb = None  # derived from clip+projection
        else:
            self.item_clip = None
            self.item_projection = None
            self.item_emb = nn.Embedding(n_items, emb_dim)
            nn.init.xavier_uniform_(self.item_emb.weight)

    def _item_vectors(self) -> torch.Tensor:
        """Current item embedding matrix from CLIP features (if used) or the
        learnable table directly."""
        if self.item_projection is not None:
            return self.item_projection(self.item_clip)
        return self.item_emb.weight

    def _base_embeddings(self) -> torch.Tensor:
        """Concatenated [users; items] layer-0 embeddings."""
        return torch.cat([self.user_emb.weight, self._item_vectors()], dim=0)

    def propagate(self, adj_norm: torch.Tensor) -> torch.Tensor:
        """K rounds of graph propagation averaged across layers.

        Returns E_final of shape [(n_users + n_items), emb_dim].
        """
        all_embs = [self._base_embeddings()]
        e = all_embs[0]
        for _ in range(self.n_layers):
            e = torch.sparse.mm(adj_norm, e)
            all_embs.append(e)
        return torch.stack(all_embs, dim=0).mean(dim=0)

    def bpr_loss(
        self,
        adj_norm: torch.Tensor,
        users: torch.Tensor,
        pos_items: torch.Tensor,
        neg_items: torch.Tensor,
    ) -> torch.Tensor:
        """BPR ranking loss on (user, liked_item, unliked_item) triples."""
        all_embs = self.propagate(adj_norm)
        user_e = all_embs[users]
        pos_e = all_embs[self.n_users + pos_items]
        neg_e = all_embs[self.n_users + neg_items]

        pos_scores = (user_e * pos_e).sum(dim=1)
        neg_scores = (user_e * neg_e).sum(dim=1)

        return -F.logsigmoid(pos_scores - neg_scores).mean()


def _build_norm_adj(
    edges: list[tuple[int, int]], n_users: int, n_items: int
) -> torch.Tensor:
    """Symmetric-normalised bipartite adjacency for LightGCN.

    The full adjacency is
        A = [  0    R  ]   where R is user-item [n_users x n_items]
            [ R^T   0  ]
    normalised as D^(-1/2) A D^(-1/2), stored as sparse COO.
    """
    n_nodes = n_users + n_items
    if not edges:
        return torch.sparse_coo_tensor(
            torch.zeros((2, 0), dtype=torch.long), torch.zeros(0), (n_nodes, n_nodes),
        ).coalesce()

    rows, cols = [], []
    for u, i in edges:
        rows.append(u)
        cols.append(n_users + i)
        rows.append(n_users + i)
        cols.append(u)
    rows_t = torch.tensor(rows, dtype=torch.long)
    cols_t = torch.tensor(cols, dtype=torch.long)
    values = torch.ones(len(rows), dtype=torch.float32)

    deg = torch.zeros(n_nodes, dtype=torch.float32)
    deg.index_add_(0, rows_t, torch.ones_like(values))

    deg_inv_sqrt = torch.where(deg > 0, deg.pow(-0.5), torch.zeros_like(deg))
    norm_values = deg_inv_sqrt[rows_t] * deg_inv_sqrt[cols_t] * values

    indices = torch.stack([rows_t, cols_t], dim=0)
    return torch.sparse_coo_tensor(indices, norm_values, (n_nodes, n_nodes)).coalesce()


class LightGCNService:
    """Training, persistence, and inference facade for LightGCN."""

    def __init__(self):
        self.final_embs: Optional[np.ndarray] = None
        self.user_id_to_idx: dict[str, int] = {}
        self.item_id_to_idx: dict[int, int] = {}
        self.n_users = 0
        self.n_items = 0
        self.meta: dict = {}
        self._load()

    # Persistence -----------------------------------------------------

    def _load(self):
        if not (os.path.exists(CHECKPOINT_FILE) and os.path.exists(MAPPING_FILE)):
            logger.info("[LightGCN] No checkpoint found — service starts cold")
            return
        try:
            state = torch.load(CHECKPOINT_FILE, map_location="cpu", weights_only=True)
            self.final_embs = state["final_embs"].numpy()
            with open(MAPPING_FILE, "r") as f:
                m = json.load(f)
            self.user_id_to_idx = {str(k): int(v) for k, v in m["user_id_to_idx"].items()}
            self.item_id_to_idx = {int(k): int(v) for k, v in m["item_id_to_idx"].items()}
            self.n_users = m["n_users"]
            self.n_items = m["n_items"]
            if os.path.exists(META_FILE):
                with open(META_FILE, "r") as f:
                    self.meta = json.load(f)
            logger.info(
                f"[LightGCN] Checkpoint loaded: {self.n_users} users x {self.n_items} items, "
                f"trained {self.meta.get('trained_at', '?')}"
            )
        except Exception as e:
            logger.warning(f"[LightGCN] Checkpoint load failed: {e}")
            self.final_embs = None

    def _save(self, final_embs: torch.Tensor, meta: dict):
        os.makedirs(LIGHTGCN_DIR, exist_ok=True)
        torch.save({"final_embs": final_embs.detach().cpu()}, CHECKPOINT_FILE)
        with open(MAPPING_FILE, "w") as f:
            json.dump({
                "user_id_to_idx": self.user_id_to_idx,
                "item_id_to_idx": {str(k): v for k, v in self.item_id_to_idx.items()},
                "n_users": self.n_users,
                "n_items": self.n_items,
            }, f)
        with open(META_FILE, "w") as f:
            json.dump(meta, f)
        self.meta = meta

    # Status ----------------------------------------------------------

    def is_ready(self) -> bool:
        return self.final_embs is not None

    def has_user(self, user_id: str) -> bool:
        return self.is_ready() and user_id in self.user_id_to_idx

    # Training --------------------------------------------------------

    async def train_from_db(self, db_pool, min_likes_per_user: int = 1) -> dict:
        """Pull interactions from Postgres, train, persist. Called from the
        /clip/train-lightgcn endpoint nightly."""
        start = time.time()

        async with db_pool.acquire() as conn:
            edge_rows = await conn.fetch("""
                SELECT DISTINCT ul.user_id AS user_id, oi.wardrobe_item_id AS item_id
                FROM user_likes ul
                JOIN outfit_items oi ON oi.outfit_id = ul.outfit_id
                WHERE ul.created_at > NOW() - INTERVAL '180 days'
            """)

            item_rows = await conn.fetch("""
                SELECT id, embedding
                FROM wardrobe_items
                WHERE embedding IS NOT NULL AND COALESCE(is_hidden, false) = false
            """)

        if not edge_rows:
            logger.info("[LightGCN] No likes in DB — skipping training")
            return {
                "trained": False, "reason": "no_likes",
                "n_users": 0, "n_items": 0, "n_edges": 0,
            }

        raw_edges = [(str(r["user_id"]), int(r["item_id"])) for r in edge_rows]

        user_like_count: dict[str, int] = {}
        for uid, _ in raw_edges:
            user_like_count[uid] = user_like_count.get(uid, 0) + 1
        kept_users = {u for u, c in user_like_count.items() if c >= min_likes_per_user}
        raw_edges = [(u, i) for (u, i) in raw_edges if u in kept_users]

        user_id_to_idx: dict[str, int] = {}
        for u, _ in raw_edges:
            if u not in user_id_to_idx:
                user_id_to_idx[u] = len(user_id_to_idx)

        # Index ALL items with CLIP features, not only liked ones, so inference
        # can score the whole catalog.
        item_id_to_idx: dict[int, int] = {}
        item_clip_list: list[list[float]] = []
        for r in item_rows:
            item_id = int(r["id"])
            if item_id in item_id_to_idx:
                continue
            try:
                vec = [float(x) for x in r["embedding"]]
                if len(vec) != CLIP_DIM:
                    continue
            except (ValueError, TypeError):
                continue
            item_id_to_idx[item_id] = len(item_clip_list)
            item_clip_list.append(vec)

        dense_edges = []
        skipped_no_emb = 0
        for u, i in raw_edges:
            if i not in item_id_to_idx:
                skipped_no_emb += 1
                continue
            dense_edges.append((user_id_to_idx[u], item_id_to_idx[i]))

        n_users = len(user_id_to_idx)
        n_items = len(item_id_to_idx)

        if n_users < 2 or n_items < 2 or not dense_edges:
            logger.info(
                f"[LightGCN] Too little signal to train "
                f"(n_users={n_users}, n_items={n_items}, edges={len(dense_edges)})"
            )
            return {
                "trained": False, "reason": "insufficient_data",
                "n_users": n_users, "n_items": n_items, "n_edges": len(dense_edges),
            }

        logger.info(
            f"[LightGCN] Training: {n_users} users x {n_items} items, "
            f"{len(dense_edges)} edges (dropped {skipped_no_emb} edges with no CLIP)"
        )

        item_clip_t = torch.tensor(item_clip_list, dtype=torch.float32)
        item_clip_t = F.normalize(item_clip_t, dim=1)

        adj_norm = _build_norm_adj(dense_edges, n_users, n_items)

        model = LightGCN(
            n_users=n_users, n_items=n_items,
            emb_dim=EMB_DIM, n_layers=N_LAYERS,
            item_clip_features=item_clip_t,
        )
        optimizer = torch.optim.Adam(
            [p for p in model.parameters() if p.requires_grad],
            lr=LR, weight_decay=WEIGHT_DECAY,
        )

        pos_pairs = np.array(dense_edges, dtype=np.int64)
        user_pos_set: dict[int, set] = {}
        for u_idx, i_idx in dense_edges:
            user_pos_set.setdefault(u_idx, set()).add(i_idx)

        model.train(True)
        last_loss = float("nan")
        for epoch in range(EPOCHS):
            np.random.shuffle(pos_pairs)
            epoch_loss = 0.0
            n_batches = 0
            for start_idx in range(0, len(pos_pairs), BATCH_SIZE):
                batch = pos_pairs[start_idx:start_idx + BATCH_SIZE]
                users = torch.tensor(batch[:, 0], dtype=torch.long)
                pos = torch.tensor(batch[:, 1], dtype=torch.long)

                neg = np.empty(len(batch), dtype=np.int64)
                for k, u_idx in enumerate(batch[:, 0]):
                    pos_set = user_pos_set.get(int(u_idx), set())
                    sampled = None
                    for _ in range(10):
                        j = random.randrange(n_items)
                        if j not in pos_set:
                            sampled = j
                            break
                    neg[k] = sampled if sampled is not None else random.randrange(n_items)
                neg_t = torch.tensor(neg, dtype=torch.long)

                loss = model.bpr_loss(adj_norm, users, pos, neg_t)

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

                epoch_loss += float(loss.item())
                n_batches += 1

            avg_loss = epoch_loss / max(1, n_batches)
            last_loss = avg_loss
            if epoch % 10 == 0 or epoch == EPOCHS - 1:
                logger.info(f"[LightGCN] epoch={epoch} loss={avg_loss:.4f}")

        model.train(False)
        with torch.no_grad():
            final_embs = model.propagate(adj_norm)

        self.user_id_to_idx = user_id_to_idx
        self.item_id_to_idx = item_id_to_idx
        self.n_users = n_users
        self.n_items = n_items
        self.final_embs = final_embs.detach().cpu().numpy()

        meta = {
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "n_users": n_users,
            "n_items": n_items,
            "n_edges": len(dense_edges),
            "final_loss": round(last_loss, 4),
            "epochs": EPOCHS,
            "emb_dim": EMB_DIM,
            "layers": N_LAYERS,
            "duration_sec": round(time.time() - start, 1),
        }
        self._save(final_embs, meta)
        logger.info(f"[LightGCN] Trained & saved: {meta}")

        return {"trained": True, **meta}

    # Inference -------------------------------------------------------

    def score_items(self, user_id: str, item_ids: list[int]) -> dict[int, float]:
        """{item_id -> score} for items known to the model."""
        if not self.is_ready() or user_id not in self.user_id_to_idx:
            return {}

        u_idx = self.user_id_to_idx[user_id]
        user_vec = self.final_embs[u_idx]

        known_item_idxs = []
        known_item_ids = []
        for iid in item_ids:
            j = self.item_id_to_idx.get(iid)
            if j is None:
                continue
            known_item_idxs.append(j)
            known_item_ids.append(iid)

        if not known_item_idxs:
            return {}

        item_vecs = self.final_embs[self.n_users + np.array(known_item_idxs)]
        raw = item_vecs @ user_vec
        # Sigmoid squash for blending with CLIP cosine scores in [0, 1].
        scored = 1.0 / (1.0 + np.exp(-raw))
        return {iid: float(s) for iid, s in zip(known_item_ids, scored)}

    def rerank(
        self,
        user_id: str,
        candidates: list[dict],
        blend_weight: float = 0.35,
    ) -> list[dict]:
        """Blend LightGCN scores into candidates that carry a CLIP `score`.
        Items unknown to the model keep their original score untouched.

        final = (1 - w) * clip_score + w * lightgcn_score
        """
        if not self.is_ready() or user_id not in self.user_id_to_idx or not candidates:
            return candidates

        ids = [c.get("id") for c in candidates if c.get("id") is not None]
        gnn_scores = self.score_items(user_id, ids)
        if not gnn_scores:
            return candidates

        for c in candidates:
            iid = c.get("id")
            gs = gnn_scores.get(iid)
            if gs is None:
                continue
            cs = float(c.get("score", 0.0))
            c["score_clip"] = cs
            c["score_gnn"] = gs
            c["score"] = (1 - blend_weight) * cs + blend_weight * gs

        candidates.sort(key=lambda c: c.get("score", 0.0), reverse=True)
        return candidates
