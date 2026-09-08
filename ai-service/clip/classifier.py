import numpy as np
from PIL import Image
from .encoder import CLIPEncoderService
from .clothing_taxonomy import CANONICAL_TYPES

# Zero-shot vocabulary. This used to be a FOURTH, independently-invented list of
# clothing words ("sweater", "suit", "blazer", "sportswear") that shared not one
# string with the canonical slug vocabulary — so nothing downstream could turn a
# CLIP answer into an outfit slot. It is now keyed BY canonical slug; the value
# is only the English phrase fed to CLIP ("a photo of <phrase>"), because a slug
# like "sporty-pants" is not a phrase FashionCLIP has ever seen.
#
# test_clothing_taxonomy.py::test_classifier_types_match_canonical_vocabulary
# fails if this drifts from clothing_taxonomy.SLOT_MAP in either direction.
CLOTHING_TYPE_PROMPTS: dict[str, str] = {
    # tops
    "t-shirt": "a t-shirt",
    "shirt": "a button-down shirt",
    "blouse": "a women's blouse",
    "longsleeve": "a long sleeve top",
    "tank-top": "a sleeveless tank top",
    # mid layers
    "pullover": "a knitted sweater",
    "cardigan": "a cardigan",
    "hoodie": "a hoodie",
    "sweatshirt": "a sweatshirt",
    "turtleneck": "a turtleneck sweater",
    "vest": "a sleeveless vest",
    "suit-jacket": "a tailored blazer",
    # one-piece
    "dress": "a dress",
    "skirt": "a skirt",
    "jumpsuit": "a jumpsuit",
    # bottoms
    "pants": "trousers",
    "jeans": "denim jeans",
    "shorts": "shorts",
    "sporty-pants": "sweatpants",
    # sets
    "classic": "a matching suit",
    "knitted-suit": "a knitted two-piece set",
    "tracksuit": "a tracksuit",
    # outerwear
    "jacket": "a light jacket",
    "coat": "a long coat",
    "parka": "a parka",
    "puffer-jacket": "a puffer down jacket",
    "fur-coat": "a fur coat",
    "sheepskin-coat": "a shearling sheepskin coat",
    # shoes
    "shoes": "dress shoes",
    "boots": "boots",
    "sneakers": "sneakers",
    "sandals": "sandals",
    # accessories — moved up from NON_GARMENT_PROMPTS when they got real slots.
    "bag": "a handbag",
    "hat": "a hat",
    "scarf": "a scarf",
    "jewellery": "a piece of jewellery",
    "sunglasses": "sunglasses",
    "belt": "a belt",
    "watch": "a wristwatch",
}

CLOTHING_TYPES = list(CLOTHING_TYPE_PROMPTS)

# Things the outfit vocabulary has no slug for. Kept in the zero-shot vocabulary
# on purpose: without them CLIP is forced to call a handbag "a light jacket".
# These come back as clothing_type=None + non_garment=<label>, never as a slug.
NON_GARMENT_PROMPTS: dict[str, str] = {
    "gloves": "gloves",
    "underwear": "underwear",
    "swimwear": "swimwear",
}

_ALL_TYPE_KEYS = CLOTHING_TYPES + list(NON_GARMENT_PROMPTS)
_ALL_TYPE_PROMPTS = list(CLOTHING_TYPE_PROMPTS.values()) + list(NON_GARMENT_PROMPTS.values())

assert set(CLOTHING_TYPE_PROMPTS) == set(CANONICAL_TYPES), (
    "CLOTHING_TYPE_PROMPTS must cover exactly clothing_taxonomy.SLOT_MAP: "
    f"missing={sorted(set(CANONICAL_TYPES) - set(CLOTHING_TYPE_PROMPTS))} "
    f"extra={sorted(set(CLOTHING_TYPE_PROMPTS) - set(CANONICAL_TYPES))}"
)
assert not (set(NON_GARMENT_PROMPTS) & set(CANONICAL_TYPES))

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

# Gender zero-shot. Conditioning on the garment type is not cosmetic: with
# plain "men's / women's clothing" prompts FashionCLIP is female-biased —
# median p_male-p_female was +0.2 for MALE items and -0.7 for female ones,
# so any symmetric cut called half the men's catalogue "unisex" (calibration
# on 160 feed-labelled SELA/ЦУМ items, 2026-09-07). With "men's <type>" the
# medians move to +0.6 / -0.9. At ±0.5: 55-72% of male and 80-93% of female
# items get their gender, 3-7% land on the wrong side, the rest is an honest
# "cannot tell" — which is what 'unisex' has to mean from now on. Before this
# the cron read the STYLE tags and stamped 'unisex' on everything.
GENDER_MALE_MIN = 0.5
GENDER_FEMALE_MAX = -0.5


class CLIPClassifierService:
    def __init__(self, encoder: CLIPEncoderService):
        self.encoder = encoder
        self._type_embs = self._encode_phrases(_ALL_TYPE_PROMPTS)
        self._color_embs = self._encode_labels(COLORS)
        self._style_embs = self._encode_labels(STYLES)
        self._person_embs = np.stack([self.encoder.encode_text(q) for q in PERSON_QUERIES])
        self._flatlay_embs = np.stack([self.encoder.encode_text(q) for q in FLATLAY_QUERIES])

    def _encode_labels(self, labels: list) -> np.ndarray:
        return self._encode_phrases(labels)

    def _gender_embs(self, clothing_type) -> np.ndarray:
        ct = (clothing_type or "clothing").replace("-", " ")
        cache = self.__dict__.setdefault("_gender_cache", {})
        if ct not in cache:
            cache[ct] = np.stack([self.encoder.encode_text(p) for p in (
                f"a photo of men's {ct}, menswear",
                f"a photo of women's {ct}, womenswear",
                f"a photo of unisex {ct}",
            )])
        return cache[ct]

    def gender(self, emb: np.ndarray, clothing_type) -> tuple[str, float]:
        """('male'|'female'|'unisex', p_male - p_female) — see GENDER_* above."""
        z = 100.0 * (self._gender_embs(clothing_type) @ emb)
        z = z - z.max()
        p = np.exp(z)
        p = p / p.sum()
        d = float(p[0] - p[1])
        label = "male" if d >= GENDER_MALE_MIN else "female" if d <= GENDER_FEMALE_MAX else "unisex"
        return label, round(d, 3)

    def _encode_phrases(self, phrases: list) -> np.ndarray:
        return np.stack([self.encoder.encode_text("a photo of " + p) for p in phrases])

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
                "non_garment": None,
                "color": None,
                "style_tags": [],
                "embedding": emb.tolist(),
                "is_clothing": False,
                "has_person": False,
                "confidence": round(clothing_confidence, 3),
            }

        person_diff = self._person_score(emb)
        top_key = self._top_k(emb, self._type_embs, _ALL_TYPE_KEYS, 1)[0]
        # A non-garment answer never becomes a slug — see NON_GARMENT_PROMPTS.
        is_garment = top_key in CLOTHING_TYPE_PROMPTS
        color = self._top_k(emb, self._color_embs, COLORS, 1)[0]
        style_tags = self._top_k(emb, self._style_embs, STYLES, 3)
        gender, gender_score = self.gender(emb, top_key if is_garment else None)
        return {
            "clothing_type": top_key if is_garment else None,
            "non_garment": None if is_garment else top_key,
            "color": color,
            "style_tags": style_tags,
            "gender": gender,
            "gender_score": gender_score,
            "embedding": emb.tolist(),
            "is_clothing": True,
            "has_person": person_diff > PERSON_SCORE_THRESHOLD,
            "person_score": person_diff,
            "confidence": round(clothing_confidence, 3),
        }
