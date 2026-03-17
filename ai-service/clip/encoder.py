import torch
import numpy as np
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


class CLIPEncoderService:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.fashion_model = CLIPModel.from_pretrained("patrickjohncyh/fashion-clip").to(self.device).eval()
        self.fashion_processor = CLIPProcessor.from_pretrained("patrickjohncyh/fashion-clip")
        self.base_model = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(self.device).eval()
        self.base_processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")

    @torch.no_grad()
    def encode_image(self, image: Image.Image, use_fashion: bool = False) -> np.ndarray:
        model = self.fashion_model if use_fashion else self.base_model
        proc = self.fashion_processor if use_fashion else self.base_processor
        inputs = proc(images=image, return_tensors="pt").to(self.device)
        emb = model.get_image_features(**inputs)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy().flatten().astype(np.float32)

    @torch.no_grad()
    def encode_text(self, text: str, use_fashion: bool = False) -> np.ndarray:
        model = self.fashion_model if use_fashion else self.base_model
        proc = self.fashion_processor if use_fashion else self.base_processor
        inputs = proc(text=text, return_tensors="pt", padding=True, truncation=True).to(self.device)
        emb = model.get_text_features(**inputs)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy().flatten().astype(np.float32)

    @torch.no_grad()
    def encode_composed(self, image: Image.Image, text: str, alpha: float = 0.6) -> np.ndarray:
        img_emb = self.encode_image(image, use_fashion=True)
        txt_emb = self.encode_text(text, use_fashion=True)
        combined = alpha * img_emb + (1 - alpha) * txt_emb
        return (combined / np.linalg.norm(combined)).astype(np.float32)
