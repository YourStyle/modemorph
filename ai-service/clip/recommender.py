import numpy as np
from PIL import Image
from .encoder import CLIPEncoderService
from .index import FAISSIndexService
from .profile import StyleProfileService


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

    def search_by_image(self, image: Image.Image, k: int = 20) -> list:
        emb = self.encoder.encode_image(image)
        return self.index.search(emb, k=k)

    def search_by_text(self, text: str, k: int = 20) -> list:
        emb = self.encoder.encode_text(text)
        return self.index.search(emb, k=k)

    def search_composed(self, image: Image.Image, text: str, k: int = 20) -> list:
        emb = self.encoder.encode_composed(image, text)
        return self.index.search(emb, k=k)

    def outfit_complements(self, item_embedding: list, k: int = 10) -> list:
        emb = np.array(item_embedding, dtype=np.float32)
        return self.index.search(emb, k=k + 1)[1:]  # skip self
