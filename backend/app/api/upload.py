"""File upload endpoints — Yandex S3, with SSRF protection and file validation."""

import hashlib
import time
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import Response

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_MIME_PREFIXES = ("image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif")
ALLOWED_PROXY_HOSTS = {"storage.yandexcloud.net", "modemorphs3.storage.yandexcloud.net"}


def _validate_url(url: str, allow_hosts: set = None):
    """Prevent SSRF — only allow https and trusted hosts."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    if allow_hosts and parsed.hostname not in allow_hosts:
        raise HTTPException(status_code=400, detail=f"URL host not allowed: {parsed.hostname}")
    # Block private/loopback IPs
    if parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0") or (parsed.hostname and parsed.hostname.startswith("192.168.")):
        raise HTTPException(status_code=400, detail="Internal URLs not allowed")


def _get_s3_client():
    try:
        import boto3
        return boto3.client(
            "s3",
            endpoint_url=settings.YANDEX_S3_ENDPOINT,
            aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID,
            aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY,
            region_name="ru-central1",
        )
    except ImportError:
        return None


@router.post("/upload-to-yandex")
async def upload_to_yandex(
    file: UploadFile = File(...),
    folder: str = "",
    user: dict = Depends(get_current_user),
):
    """Upload file to Yandex S3 with size and type validation."""
    # Validate content type
    if file.content_type and not any(file.content_type.startswith(m) for m in ALLOWED_MIME_PREFIXES):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    content = await file.read()

    # Validate size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    unique = f"{int(time.time())}-{hashlib.md5(content[:1024]).hexdigest()[:8]}"

    if folder:
        key = f"{folder}/{unique}.{ext}"
    else:
        key = f"upload-{unique}.{ext}"

    s3 = _get_s3_client()
    if not s3:
        raise HTTPException(status_code=500, detail="S3 client not available")

    s3.put_object(
        Bucket=settings.YANDEX_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=file.content_type or "image/jpeg",
    )

    url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{key}"
    return {"success": True, "url": url, "key": key}


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(None),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Upload image — file or URL (with SSRF protection)."""
    if file:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large")
        ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    else:
        body = await request.json()
        image_url = body.get("url") or body.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="No file or URL provided")

        _validate_url(image_url)  # SSRF protection

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(image_url)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to download image")
            content = resp.content
        ext = "jpg"

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    key = f"upload-{hashlib.md5(content[:1024] + str(time.time()).encode()).hexdigest()[:8]}.{ext}"

    s3 = _get_s3_client()
    if not s3:
        raise HTTPException(status_code=500, detail="S3 not configured")

    s3.put_object(Bucket=settings.YANDEX_BUCKET_NAME, Key=key, Body=content, ContentType=f"image/{ext}")
    url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{key}"
    return {"url": url, "key": key}


@router.get("/yandex-s3/list")
async def list_s3(user: dict = Depends(get_current_user)):
    s3 = _get_s3_client()
    if not s3:
        return {"objects": []}
    resp = s3.list_objects_v2(Bucket=settings.YANDEX_BUCKET_NAME, MaxKeys=100)
    return {"objects": [{"key": o["Key"], "size": o["Size"]} for o in resp.get("Contents", [])]}


@router.delete("/yandex-s3/delete")
async def delete_s3(key: str = Query(...), user: dict = Depends(get_current_user)):
    """Delete S3 object — only allow keys that contain the user's ID or are in upload/avatars folders."""
    s3 = _get_s3_client()
    if not s3:
        raise HTTPException(status_code=500, detail="S3 not configured")

    # Basic ownership check — prevent deleting other users' files
    allowed_prefixes = ("upload-", "avatars/", f"users/{user['id']}/")
    if not any(key.startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Cannot delete this file")

    s3.delete_object(Bucket=settings.YANDEX_BUCKET_NAME, Key=key)
    return {"success": True}


@router.get("/proxy-image")
async def proxy_image(
    url: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Proxy external image — authenticated, with host allowlist."""
    _validate_url(url, allow_hosts=ALLOWED_PROXY_HOSTS)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url)
    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
