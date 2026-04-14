from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    auth, health, wardrobe, wardrobe_user_items, basic_items,
    limits, recommendations, outfits, looks, payments,
    ai, me, upload, weather, misc, admin, cron, partner,
    item_dislikes,
)
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import validate_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_settings()
    yield


app = FastAPI(
    title="ModeMorph API",
    version="2.0.0",
    description="ModeMorph backend — PostgreSQL + FastAPI",
    lifespan=lifespan,
)

# Rate limiting
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://modemorph.ru",
        "https://www.modemorph.ru",
        "https://web.telegram.org",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core routes ──
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(me.router, prefix="/api/me", tags=["me"])
app.include_router(wardrobe.router, prefix="/api/wardrobe", tags=["wardrobe"])
app.include_router(wardrobe_user_items.router, prefix="/api/wardrobe-user-items", tags=["wardrobe"])
app.include_router(basic_items.router, prefix="/api", tags=["basic-items"])
app.include_router(outfits.router, prefix="/api/outfits", tags=["outfits"])
app.include_router(looks.router, prefix="/api", tags=["looks"])
app.include_router(limits.router, prefix="/api/limits", tags=["limits"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(weather.router, prefix="/api", tags=["weather"])
app.include_router(misc.router, prefix="/api", tags=["misc"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(partner.admin_router, prefix="/api/admin", tags=["admin-partners"])
app.include_router(partner.router, prefix="/api/partner", tags=["partner"])
app.include_router(partner.public_router, prefix="/api/v1", tags=["partner-api"])
app.include_router(item_dislikes.router, prefix="/api/items", tags=["items"])
app.include_router(cron.router, prefix="/api/cron", tags=["cron"])
