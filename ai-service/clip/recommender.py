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

    def recommend_for_user(
        self, user_embeddings: list, k: int = 20, like_embeddings: list | None = None,
    ) -> list:
        if not user_embeddings:
            return []
        mean_emb = self._query_vector(user_embeddings, like_embeddings)
        if mean_emb is None:
            return []
        return self.index.search(mean_emb, k=k)

    # Насколько сильно лайки сдвигают запрос относительно гардероба.
    # 0.5 — лайки весят вдвое меньше гардероба: гардероб описывает, что человек
    # носит, лайк — что он хочет. Полный вес (1.0) на 1-2 лайках увёл бы всю
    # выдачу в одну вещь, нулевой — это то, что было до этой правки.
    LIKE_WEIGHT = 0.5

    def _query_vector(self, user_embeddings: list, like_embeddings: list | None):
        """Вектор запроса: гардероб, сдвинутый в сторону лайков (Rocchio).

        Зачем сдвиг вообще: раньше запросом было ЧИСТОЕ среднее гардероба, и
        замер прода 28.08.2026 показал, к чему это приводит — средние векторы
        разных людей лежат в тесном конусе, поэтому у всех выигрывают одни и те
        же глобальные соседи (вещь id=362 попадала в top-80 у 82 из 109
        пользователей, а сам top-80 по всей базе покрывал 3,8% каталога).
        Лайк — единственный сигнал, который у нас есть и который двигает
        человека ИЗ этого конуса, потому что он про него, а не про склад.

        Дизлайки здесь не участвуют: они уже вычитаются на этапе поиска в
        index.search_with_penalties(), и вычитать их дважды значило бы менять
        калибровку dislike_weight вслепую.
        """
        mean_emb = self.profiler.mean_embedding(user_embeddings)
        if mean_emb is None:
            return None
        if not like_embeddings:
            return mean_emb

        liked = self.profiler.mean_embedding(like_embeddings)
        if liked is None:
            return mean_emb

        # Оба слагаемых уже единичной длины (mean_embedding нормирует), поэтому
        # сумма — это честная интерполяция направлений, а не перекос в сторону
        # того, у кого длиннее вектор. Нормируем результат: FAISS IndexFlatIP
        # считает скалярное произведение, и без нормировки это перестанет быть
        # косинусом.
        blended = mean_emb + self.LIKE_WEIGHT * liked
        norm = np.linalg.norm(blended)
        return (blended / norm).astype(np.float32) if norm > 0 else mean_emb

    def recommend_for_user_with_dislikes(
        self,
        user_embeddings: list,
        dislike_embeddings: list | None = None,
        cluster_dislike_emb: np.ndarray | None = None,
        exclude_ids: set | None = None,
        k: int = 20,
        dislike_weight: float = 0.3,
        cluster_weight: float = 0.15,
        like_embeddings: list | None = None,
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
            like_embeddings: List of liked item embeddings (positive signal, Rocchio)
        """
        if not user_embeddings:
            return []
        mean_emb = self._query_vector(user_embeddings, like_embeddings)
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


if __name__ == "__main__":
    # Проверка сдвига запроса лайками. Гоняется как `python -m clip.recommender`
    # и не требует ни модели, ни индекса — _query_vector это чистая арифметика.
    rec = CLIPRecommenderService.__new__(CLIPRecommenderService)
    rec.profiler = StyleProfileService()

    wardrobe = [[1.0, 0.0, 0.0]]
    liked = [[0.0, 1.0, 0.0]]

    # Без лайков запрос равен гардеробу.
    q0 = rec._query_vector(wardrobe, None)
    assert np.allclose(q0, [1.0, 0.0, 0.0]), q0

    # С лайком запрос уезжает в их сторону, но НЕ доезжает до самого лайка:
    # гардероб всё ещё весит больше (LIKE_WEIGHT = 0.5).
    q1 = rec._query_vector(wardrobe, liked)
    assert np.isclose(np.linalg.norm(q1), 1.0), f"запрос обязан быть единичным: {np.linalg.norm(q1)}"
    assert q1[1] > 0, "лайк не сдвинул запрос"
    assert q1[0] > q1[1], "лайк перевесил гардероб — проверь LIKE_WEIGHT"

    # Лайк того, что уже в гардеробе, направление не меняет.
    q2 = rec._query_vector(wardrobe, wardrobe)
    assert np.allclose(q2, q0), q2

    # Пустой гардероб — не наша ветка, отвечает cold-start.
    assert rec._query_vector([], liked) is None

    print("OK: лайки сдвигают запрос, гардероб остаётся тяжелее, вектор единичный")
