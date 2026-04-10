"""
N8N Proxy — routes AI API calls through n8n on a foreign server.

Only these calls go through n8n (because they need non-Russian IP):
- OpenAI GPT-4o (image analysis, outfit generation, text classification)
- OpenAI gpt-image-1 (flat-lay image generation/editing)
- FalAI (image editing for VTON)
- Gemini API (image generation for VTON)

Everything else (data prep, validation, saving) runs locally in FastAPI.
"""

import httpx
from app.core.config import settings


class N8NProxy:
    """Thin proxy to n8n webhooks for AI API calls that need foreign server."""

    def __init__(self):
        self.base_url = settings.N8N_BASE_URL.rstrip("/")
        self.timeout = httpx.Timeout(120.0, connect=30.0)

    async def call_webhook(self, path: str, payload: dict, files: dict = None) -> dict:
        """Call an n8n webhook endpoint."""
        url = f"{self.base_url}/{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if files:
                response = await client.post(url, data=payload, files=files)
            else:
                response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()

    # ── Photo Analysis (ai-photo-parse) ──
    async def analyze_photo(self, image_bytes: bytes, filename: str = "image.jpg") -> dict:
        """
        Send image to n8n for GPT-4o analysis + gpt-image-1 flat-lay generation.
        N8N handles: image pre-check → clothing detection → flat-lay generation.
        """
        return await self.call_webhook(
            "ai-photo-parse",
            payload={},
            files={"image": (filename, image_bytes, "image/jpeg")},
        )

    # ── User Prompt Recommendations ──
    async def user_prompt_recommendation(
        self, user_id: str, prompt: str, weather: dict, wardrobe_items: list
    ) -> dict:
        """
        Send user prompt + items to n8n for GPT-4o outfit/advice generation.
        Pre-processing (item fetching, classification) done in FastAPI.
        """
        return await self.call_webhook(
            "user-prompt-rec",
            payload={
                "user_id": user_id,
                "prompt": prompt,
                "weather": weather,
                "wardrobe_items": wardrobe_items,
            },
        )

    # ── Main Recommendations Generation ──
    async def generate_recommendations(
        self, user_id: str, gender: str, weather: dict,
        user_items: list, catalog_items: list
    ) -> dict:
        """
        Generate outfit recommendations via n8n (GPT-5-mini).
        Data fetching + saving done in FastAPI, only AI call proxied.
        """
        return await self.call_webhook(
            "recommendations",
            payload={
                "user_id": user_id,
                "gender": gender,
                "weather": weather,
                "user_items": user_items,
                "catalog_items": catalog_items,
            },
        )

    # ── Virtual Try-On ──
    async def virtual_tryon(self, avatar_url: str, items: list) -> dict:
        """
        Virtual try-on via n8n (Gemini/FalAI image generation).
        """
        return await self.call_webhook(
            "vton",
            payload={"avatar_url": avatar_url, "items": items},
        )

    # ── Admin Clothing Detection ──
    async def detect_clothes(self, image_url: str, detection_type: str = "all") -> dict:
        """
        Admin clothing detection from URL via n8n (GPT-4o + gpt-image-1).
        """
        return await self.call_webhook(
            "get-clothes",
            payload={"image_url": image_url, "type": detection_type},
        )


n8n_proxy = N8NProxy()
