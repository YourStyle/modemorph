"""Telegram Bot API helper — direct HTTPS calls, no bot service dependency."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)


async def send_bot_message(chat_id, text: str, parse_mode: str = "HTML", reply_markup: dict | None = None) -> dict:
    """Send a Telegram message via the bot token.

    Returns {ok: bool, result?: ..., error?: str}.
    Never raises — Telegram failures should not roll back DB writes.

    Goes through HTTPS_PROXY on purpose, even though .telegram.org sits in
    NO_PROXY: from the backend container api.telegram.org resolves to IPv6
    first (no route → "Network is unreachable") and the direct IPv4 path just
    times out (checked 2026-09-08). Only the proxy delivers. Without this,
    every bot message from the backend — gift, broadcast — silently failed.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN")
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}
    if not chat_id:
        return {"ok": False, "error": "chat_id missing"}

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    proxy = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy") or None
    try:
        async with httpx.AsyncClient(timeout=15.0, proxy=proxy) as client:
            resp = await client.post(f"https://api.telegram.org/bot{token}/sendMessage", json=payload)
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Telegram sendMessage failed: %s", data)
            return data
    except Exception as exc:
        logger.exception("Telegram send error")
        return {"ok": False, "error": str(exc)}
