"""Telegram Bot API helper — direct HTTPS calls, no bot service dependency."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)


async def send_bot_message(chat_id, text: str, parse_mode: str = "HTML") -> dict:
    """Send a Telegram message via the bot token.

    Returns {ok: bool, result?: ..., error?: str}.
    Never raises — Telegram failures should not roll back DB writes.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}
    if not chat_id:
        return {"ok": False, "error": "chat_id missing"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Telegram sendMessage failed: %s", data)
            return data
    except Exception as exc:
        logger.exception("Telegram send error")
        return {"ok": False, "error": str(exc)}
