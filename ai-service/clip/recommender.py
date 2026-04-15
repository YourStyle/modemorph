import logging
import numpy as np
from PIL import Image
from .encoder import CLIPEncoderService
from .index import FAISSIndexService
from .profile import StyleProfileService, UserClusterService

logger = logging.getLogger(__name__)


class CLIPRecommenderService:
    def __init__(self, encoder: CLIPEncoderService, index: FAISSIndexService):
        self.encoder = encoder
        self.index = index
        self.profiler = StyleProfileService()

    def recommend_for_user(self, user_embeddings: list, k: int = 20) -> list:
        if not user_embeddings:
            return []
        mean_emb = self.profiler.mean_embedding(user_embeddings)
        if mean_emb is None:
            return []
        return self.index.search(mean_emb, k=k)

    def recommend_for_user_with_dislikes(
        self,
        user_embeddings: list,
        dislike_embeddings: list | None = None,
        cluster_dislike_emb: np.ndarray | None = None,
        exclude_ids: set | None = None,
        k: int = 20,
        dislike_weight: float = 0.3,
        cluster_weight: float = 0.15,
    ) -> list:
        """Recommend items with anti-preference penalties.

        Args:
            user_embeddings: List of user's wardrobe embeddings (preference signal)
            dislike_embeddings: List of disliked item embeddings (personal anti-preference)
            cluster_dislike_emb: Mean embedding of cluster dislikes (collaborative signal)
            exclude_ids: Set of item IDs to hard-exclude
            k: Number of results
            dislike_weight: Weight for personal dislike penalty (α)
            cluster_weight: Weight for cluster dislike penalty (β)
        """
        if not user_embeddings:
            return []
        mean_emb = self.profiler.mean_embedding(user_embeddings)
        if mean_emb is None:
            return []

        # Compute personal dislike mean vector
        dislike_emb = None
        if dislike_embeddings:
            dislike_emb = self.profiler.mean_embedding(dislike_embeddings)

        return self.index.search_with_penalties(
            query_emb=mean_emb,
            k=k,
            dislike_emb=dislike_emb,
            dislike_weight=dislike_weight,
            cluster_dislike_emb=cluster_dislike_emb,
            cluster_weight=cluster_weight,
            exclude_ids=exclude_ids,
        )

    def search_by_image(self, image: Image.Image, k: int = 20) -> list:
        emb = self.encoder.encode_image(image)
        return self.index.search(emb, k=k)

    def search_by_text(self, text: str, k: int = 20) -> list:
        emb = self.encoder.encode_text(text)
        return self.index.search(emb, k=k)

    def search_composed(self, image: Image.Image, text: str, k: int = 20) -> list:
        emb = self.encoder.encode_composed(image, text)
        return self.index.search(emb, k=k)

    def recommend_cold_start(
        self,
        cluster_service: UserClusterService,
        popular_item_ids: list | None = None,
        gender: str | None = None,
        k: int = 20,
    ) -> list:
        """Recommendations for users with no wardrobe items.

        Strategy:
        1. If popular items exist (from recommendation_logs), return those
        2. If gender is known, use text embedding as proxy: "stylish [gender] outfit"
        3. Otherwise, return diverse random sample from index
        """
        # Strategy 1: Popular items — caller passes pre-computed popular IDs
        if popular_item_ids and self.index.meta:
            id_set = set(popular_item_ids)
            results = [m for m in self.index.meta if m.get('id') in id_set]
            if len(results) >= k:
                return results[:k]

        # Strategy 2: Gender-based text query
        if gender:
            gender_ru = {"male": "мужской", "female": "женский"}.get(gender, "")
            if gender_ru:
                query = f"стильный {gender_ru} образ одежда"
                logger.info(f"[cold-start] Using text query: {query}")
                return self.search_by_text(query, k=k)

        # Strategy 3: Diverse random sample
        if self.index.size > 0:
            n = min(k, self.index.size)
            indices = np.random.choice(self.index.size, size=n, replace=False)
            return [self.index.meta[i] for i in indices if i < len(self.index.meta)]

        return []

    def outfit_complements(self, item_embedding: list, k: int = 10) -> list:
        emb = np.array(item_embedding, dtype=np.float32)
        return self.index.search(emb, k=k + 1)[1:]  # skip self
