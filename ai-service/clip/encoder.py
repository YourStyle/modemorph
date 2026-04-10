import torch
import numpy as np
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


class CLIPEncoderService:
    """FashionCLIP encoder — 512-dim embeddings optimized for clothing."""

    MODEL_ID = "patrickjohncyh/fashion-clip"

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(self.MODEL_ID).to(self.device).eval()
        self.processor = CLIPProcessor.from_pretrained(self.MODEL_ID)
        # FashionCLIP outputs 512-dim vectors
        self.dim = self.model.config.projection_dim

    @torch.no_grad()
    def encode_image(self, image: Image.Image) -> np.ndarray:
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device)
        vision_out = self.model.vision_model(pixel_values=pixel_values)
        emb = self.model.visual_projection(vision_out.pooler_output)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy().flatten().astype(np.float32)

    @torch.no_grad()
    def encode_text(self, text: str) -> np.ndarray:
        inputs = self.processor(text=text, return_tensors="pt", padding=True, truncation=True)
        input_ids = inputs["input_ids"].to(self.device)
        attention_mask = inputs.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.device)
        text_out = self.model.text_model(input_ids=input_ids, attention_mask=attention_mask)
        emb = self.model.text_projection(text_out.pooler_output)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy().flatten().astype(np.float32)

    @torch.no_grad()
    def encode_composed(self, image: Image.Image, text: str, alpha: float = 0.6) -> np.ndarray:
        img_emb = self.encode_image(image)
        txt_emb = self.encode_text(text)
        combined = alpha * img_emb + (1 - alpha) * txt_emb
        return (combined / np.linalg.norm(combined)).astype(np.float32)
