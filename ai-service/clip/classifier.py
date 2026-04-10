import numpy as np
from PIL import Image
from .encoder import CLIPEncoderService

CLOTHING_TYPES = [
    "t-shirt", "shirt", "blouse", "sweater", "hoodie", "jacket", "coat",
    "dress", "skirt", "pants", "jeans", "shorts", "suit", "blazer",
    "underwear", "swimwear", "sportswear", "shoes", "boots", "sneakers",
    "sandals", "bag", "accessory", "hat", "scarf", "gloves",
]

COLORS = [
    "black", "white", "grey", "beige", "brown", "red", "pink", "orange",
    "yellow", "green", "blue", "navy", "purple", "multicolor",
]

STYLES = [
    "casual", "formal", "business", "sport", "streetwear", "bohemian",
    "minimalist", "classic", "romantic", "grunge", "preppy", "vintage",
]


class CLIPClassifierService:
    def __init__(self, encoder: CLIPEncoderService):
        self.encoder = encoder
        self._type_embs = self._encode_labels(CLOTHING_TYPES)
        self._color_embs = self._encode_labels(COLORS)
        self._style_embs = self._encode_labels(STYLES)

    def _encode_labels(self, labels: list) -> np.ndarray:
        phrases = ["a photo of " + l for l in labels]
        return np.stack([self.encoder.encode_text(p) for p in phrases])

    def _top_k(self, emb: np.ndarray, label_embs: np.ndarray, labels: list, k: int = 3) -> list:
        scores = label_embs @ emb
        idx = np.argsort(scores)[::-1][:k]
        return [labels[i] for i in idx]

    def classify(self, image: Image.Image) -> dict:
        emb = self.encoder.encode_image(image)
        clothing_type = self._top_k(emb, self._type_embs, CLOTHING_TYPES, 1)[0]
        color = self._top_k(emb, self._color_embs, COLORS, 1)[0]
        style_tags = self._top_k(emb, self._style_embs, STYLES, 3)
        return {
            "clothing_type": clothing_type,
            "color": color,
            "style_tags": style_tags,
            "embedding": emb.tolist(),
        }
