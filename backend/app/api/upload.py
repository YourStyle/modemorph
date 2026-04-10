"""File upload endpoints — Yandex S3."""

import hashlib
import time
from io import BytesIO

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


def _get_s3_client():
    """Create boto3-style S3 client for Yandex."""
    try:
        import boto3
        return boto3.client(
            "s3",
            endpoint_url=settings.YANDEX_S3_ENDPOINT,
            aws_access_key_id=settings.YANDEX_S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.YANDEX_S3_SECRET_ACCESS_KEY,
            region_name="ru-central1",
        )
    except ImportError:
        return None


@router.post("/upload-to-yandex")
async def upload_to_yandex(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload file to Yandex S3."""
    content = await file.read()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    key = f"upload-{hashlib.md5(content[:1024] + str(time.time()).encode()).hexdigest()[:8]}.{ext}"

    s3 = _get_s3_client()
    if not s3:
        raise HTTPException(status_code=500, detail="S3 client not available")

    s3.put_object(
        Bucket=settings.YANDEX_S3_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=file.content_type or "image/jpeg",
    )

    url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_S3_BUCKET_NAME}/{key}"
    return {"url": url, "key": key}


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(None),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Upload image — supports both file upload and URL-based upload."""
    if file:
        content = await file.read()
        ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    else:
        body = await request.json()
        image_url = body.get("url") or body.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="No file or URL provided")

        async with httpx.AsyncClient() as client:
            resp = await client.get(image_url)
            content = resp.content
        ext = "jpg"

    key = f"upload-{hashlib.md5(content[:1024] + str(time.time()).encode()).hexdigest()[:8]}.{ext}"

    s3 = _get_s3_client()
    if s3:
        s3.put_object(
            Bucket=settings.YANDEX_S3_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=f"image/{ext}",
        )
        url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_S3_BUCKET_NAME}/{key}"
    else:
        raise HTTPException(status_code=500, detail="S3 not configured")

    return {"url": url, "key": key}


@router.get("/yandex-s3/list")
async def list_s3(user: dict = Depends(get_current_user)):
    s3 = _get_s3_client()
    if not s3:
        return {"objects": []}
    resp = s3.list_objects_v2(Bucket=settings.YANDEX_S3_BUCKET_NAME, MaxKeys=100)
    objects = [{"key": o["Key"], "size": o["Size"]} for o in resp.get("Contents", [])]
    return {"objects": objects}


@router.delete("/yandex-s3/delete")
async def delete_s3(key: str = Query(...), user: dict = Depends(get_current_user)):
    s3 = _get_s3_client()
    if not s3:
        raise HTTPException(status_code=500, detail="S3 not configured")
    s3.delete_object(Bucket=settings.YANDEX_S3_BUCKET_NAME, Key=key)
    return {"success": True}


@router.get("/proxy-image")
async def proxy_image(url: str = Query(...)):
    """Proxy external image to avoid CORS issues."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url)
    from fastapi.responses import Response
    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
