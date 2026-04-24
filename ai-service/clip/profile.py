import json
import logging
import os
import numpy as np
from sklearn.cluster import KMeans
from typing import Optional

logger = logging.getLogger(__name__)

CLUSTERS_DIR = os.environ.get('FAISS_INDEX_DIR', '/data/faiss_index')
CLUSTERS_FILE = os.path.join(CLUSTERS_DIR, 'user_clusters.json')


class StyleProfileService:
    def __init__(self, n_clusters: int = 5):
        self.n_clusters = n_clusters

    def build(self, embeddings: list) -> dict:
        if len(embeddings) < 2:
            return {'centroids': embeddings, 'labels': list(range(len(embeddings)))}
        matrix = np.array(embeddings, dtype=np.float32)
        k = min(self.n_clusters, len(embeddings))
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(matrix).tolist()
        centroids = km.cluster_centers_.tolist()
        return {'centroids': centroids, 'labels': labels}

    def mean_embedding(self, embeddings: list) -> Optional[np.ndarray]:
        if not embeddings:
            return None
        matrix = np.array(embeddings, dtype=np.float32)
        mean = matrix.mean(axis=0)
        norm = np.linalg.norm(mean)
        return (mean / norm).astype(np.float32) if norm > 0 else mean


class UserClusterService:
    """Manages user taste clusters for collaborative filtering.

    Clusters are persisted as a JSON file alongside the FAISS index.
    Structure:
    {
        "n_clusters": 8,
        "user_assignments": {"user_id": cluster_idx, ...},
        "cluster_dislike_embeddings": {
            "0": [512-dim float list],  // mean of all disliked item embeddings in cluster 0
            ...
        }
    }
    """

    def __init__(self):
        self.data: dict = {}
        self._load()

    def _load(self):
        if os.path.exists(CLUSTERS_FILE):
            try:
                with open(CLUSTERS_FILE, 'r') as f:
                    self.data = json.load(f)
                logger.info(f"[Clusters] Loaded {len(self.data.get('user_assignments', {}))} user assignments")
            except Exception as e:
                logger.warning(f"[Clusters] Failed to load: {e}")
                self.data = {}

    def _save(self):
        os.makedirs(CLUSTERS_DIR, exist_ok=True)
        with open(CLUSTERS_FILE, 'w') as f:
            json.dump(self.data, f)

    def get_user_cluster(self, user_id: str) -> Optional[int]:
        return self.data.get('user_assignments', {}).get(user_id)

    def get_cluster_dislike_embedding(self, cluster_id: int) -> Optional[np.ndarray]:
        emb_list = self.data.get('cluster_dislike_embeddings', {}).get(str(cluster_id))
        if emb_list:
            return np.array(emb_list, dtype=np.float32)
        return None

    def get_cluster_popular_items(self, cluster_id: int) -> list:
        """Return list of {id, score} for items popular within the user's taste cluster.
        Score is a time-decayed like count from outfit_items joined through user_likes."""
        entry = self.data.get('cluster_popular_items', {}).get(str(cluster_id))
        if not entry:
            return []
        return entry if isinstance(entry, list) else []

    async def build_clusters(self, db_pool, n_clusters: int = 8) -> dict:
        """Build user clusters from wardrobe embeddings + dislike data.

        1. For each active user, compute mean wardrobe embedding (taste profile)
        2. Run KMeans to cluster users
        3. For each cluster, aggregate disliked item embeddings into a mean
        4. Persist results
        """
        async with db_pool.acquire() as conn:
            # 1. Get all users with embeddings
            user_rows = await conn.fetch("""
                SELECT user_id, embedding FROM wardrobe_user_items
                WHERE embedding IS NOT NULL
                ORDER BY user_id
            """)

        # Group embeddings by user
        user_embeddings: dict[str, list] = {}
        for row in user_rows:
            uid = str(row['user_id'])
            try:
                vec = [float(x) for x in row['embedding']]
                user_embeddings.setdefault(uid, []).append(vec)
            except (ValueError, TypeError):
                continue

        if len(user_embeddings) < 2:
            logger.info("[Clusters] Not enough users for clustering")
            return {"users": len(user_embeddings), "clusters": 0}

        # 2. Compute mean embedding per user (taste profile)
        profiler = StyleProfileService()
        user_ids = []
        user_profiles = []
        for uid, embs in user_embeddings.items():
            mean = profiler.mean_embedding(embs)
            if mean is not None:
                user_ids.append(uid)
                user_profiles.append(mean)

        if len(user_profiles) < 2:
            return {"users": len(user_profiles), "clusters": 0}

        # 3. KMeans clustering
        k = min(n_clusters, len(user_profiles))
        matrix = np.stack(user_profiles)
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(matrix).tolist()

        user_assignments = {}
        for uid, label in zip(user_ids, labels):
            user_assignments[uid] = label

        # 4. Aggregate dislike embeddings per cluster
        async with db_pool.acquire() as conn:
            # Get all disliked items with their embeddings
            dislike_rows = await conn.fetch("""
                SELECT d.user_id, d.item_id, d.item_source,
                       COALESCE(wi.embedding, wui.embedding) as embedding
                FROM user_item_dislikes d
                LEFT JOIN wardrobe_items wi ON d.item_id = wi.id AND d.item_source = 'wardrobe_items'
                LEFT JOIN wardrobe_user_items wui ON d.item_id = wui.id AND d.item_source = 'wardrobe_user_items'
                WHERE COALESCE(wi.embedding, wui.embedding) IS NOT NULL
            """)

        # Group dislike embeddings by cluster
        cluster_dislike_vecs: dict[int, list] = {}
        for row in dislike_rows:
            uid = str(row['user_id'])
            cluster_id = user_assignments.get(uid)
            if cluster_id is None:
                continue
            try:
                vec = [float(x) for x in row['embedding']]
                cluster_dislike_vecs.setdefault(cluster_id, []).append(vec)
            except (ValueError, TypeError):
                continue

        # Compute mean dislike embedding per cluster
        cluster_dislike_embeddings = {}
        for cid, vecs in cluster_dislike_vecs.items():
            mean = profiler.mean_embedding(vecs)
            if mean is not None:
                cluster_dislike_embeddings[str(cid)] = mean.tolist()

        # 5. Aggregate LIKED items per cluster — "users like you also liked X".
        #    Time-decayed: half-life ~30 days so stale hits don't dominate forever.
        cluster_popular_items: dict[str, list] = {}
        total_likes = 0
        try:
            async with db_pool.acquire() as conn:
                like_rows = await conn.fetch("""
                    SELECT ul.user_id,
                           oi.wardrobe_item_id AS item_id,
                           EXTRACT(EPOCH FROM (NOW() - ul.created_at)) / 86400.0 AS age_days
                    FROM user_likes ul
                    JOIN outfit_items oi ON oi.outfit_id = ul.outfit_id
                    WHERE ul.created_at > NOW() - INTERVAL '180 days'
                """)
            total_likes = len(like_rows)

            # item_id -> { cluster_id -> weighted_count }
            per_cluster_scores: dict[int, dict[int, float]] = {}
            import math as _math
            HALFLIFE_DAYS = 30.0
            for row in like_rows:
                uid = str(row['user_id'])
                cluster_id = user_assignments.get(uid)
                if cluster_id is None:
                    continue
                item_id = row['item_id']
                if item_id is None:
                    continue
                age = float(row['age_days'] or 0.0)
                weight = _math.exp(-0.693 * age / HALFLIFE_DAYS)
                bucket = per_cluster_scores.setdefault(cluster_id, {})
                bucket[item_id] = bucket.get(item_id, 0.0) + weight

            # Keep top-30 per cluster
            TOP_N = 30
            for cid, bucket in per_cluster_scores.items():
                ranked = sorted(bucket.items(), key=lambda kv: kv[1], reverse=True)[:TOP_N]
                cluster_popular_items[str(cid)] = [
                    {"id": iid, "score": round(score, 4)} for iid, score in ranked
                ]
        except Exception as e:
            logger.warning(f"[Clusters] Failed to aggregate likes: {e}")

        # 6. Persist
        self.data = {
            "n_clusters": k,
            "user_assignments": user_assignments,
            "cluster_dislike_embeddings": cluster_dislike_embeddings,
            "cluster_popular_items": cluster_popular_items,
        }
        self._save()

        logger.info(
            f"[Clusters] Built {k} clusters from {len(user_ids)} users, "
            f"{len(cluster_dislike_embeddings)} have dislike vectors, "
            f"{len(cluster_popular_items)} have popular-item lists ({total_likes} likes)"
        )
        return {
            "users": len(user_ids),
            "clusters": k,
            "clusters_with_dislikes": len(cluster_dislike_embeddings),
            "clusters_with_popular_items": len(cluster_popular_items),
            "total_dislikes": len(dislike_rows),
            "total_likes": total_likes,
        }
