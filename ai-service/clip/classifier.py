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


PERSON_QUERIES = [
    "a person wearing clothes, fashion model in outfit",
    "a model wearing a garment, full body fashion photo",
]
FLATLAY_QUERIES = [
    "a flat-lay photo of clothing on white background without person",
    "a product photo of a garment isolated on white",
]

# Score threshold above which the image is considered to contain a person/model
PERSON_SCORE_THRESHOLD = 0.02  # person_score - flatlay_score > threshold → has_person


class CLIPClassifierService:
    def __init__(self, encoder: CLIPEncoderService):
        self.encoder = encoder
        self._type_embs = self._encode_labels(CLOTHING_TYPES)
        self._color_embs = self._encode_labels(COLORS)
        self._style_embs = self._encode_labels(STYLES)
        self._person_embs = np.stack([self.encoder.encode_text(q) for q in PERSON_QUERIES])
        self._flatlay_embs = np.stack([self.encoder.encode_text(q) for q in FLATLAY_QUERIES])

    def _encode_labels(self, labels: list) -> np.ndarray:
        phrases = ["a photo of " + l for l in labels]
        return np.stack([self.encoder.encode_text(p) for p in phrases])

    def _top_k(self, emb: np.ndarray, label_embs: np.ndarray, labels: list, k: int = 3) -> list:
        scores = label_embs @ emb
        idx = np.argsort(scores)[::-1][:k]
        return [labels[i] for i in idx]

    def _top_score(self, emb: np.ndarray, label_embs: np.ndarray) -> float:
        scores = label_embs @ emb
        return float(np.max(scores))

    def _person_score(self, emb: np.ndarray) -> float:
        """Return score > 0 if image likely contains a person/model wearing clothes."""
        person_score = float(np.max(self._person_embs @ emb))
        flatlay_score = float(np.max(self._flatlay_embs @ emb))
        return round(person_score - flatlay_score, 4)

    def has_person(self, image: Image.Image) -> bool:
        """Return True if the image appears to show a model/person wearing the garment."""
        emb = self.encoder.encode_image(image)
        return self._person_score(emb) > PERSON_SCORE_THRESHOLD

    def classify(self, image: Image.Image) -> dict:
        emb = self.encoder.encode_image(image)

        # Check if the image is clothing at all — if top similarity is too low, reject
        clothing_confidence = self._top_score(emb, self._type_embs)
        if clothing_confidence < 0.20:
            return {
                "clothing_type": None,
                "color": None,
                "style_tags": [],
                "embedding": emb.tolist(),
                "is_clothing": False,
                "has_person": False,
                "confidence": round(clothing_confidence, 3),
            }

        person_diff = self._person_score(emb)
        clothing_type = self._top_k(emb, self._type_embs, CLOTHING_TYPES, 1)[0]
        color = self._top_k(emb, self._color_embs, COLORS, 1)[0]
        style_tags = self._top_k(emb, self._style_embs, STYLES, 3)
        return {
            "clothing_type": clothing_type,
            "color": color,
            "style_tags": style_tags,
            "embedding": emb.tolist(),
            "is_clothing": True,
            "has_person": person_diff > PERSON_SCORE_THRESHOLD,
            "person_score": person_diff,
            "confidence": round(clothing_confidence, 3),
        }
