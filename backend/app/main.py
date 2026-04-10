from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    auth, health, wardrobe, wardrobe_user_items, basic_items,
    limits, recommendations, outfits, looks, payments,
    ai, me, upload, weather, misc, admin, cron,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="ModeMorph API",
    version="2.0.0",
    description="ModeMorph backend — PostgreSQL + FastAPI",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core routes ──
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(me.router, prefix="/api/me", tags=["me"])

# ── Wardrobe ──
app.include_router(wardrobe.router, prefix="/api/wardrobe", tags=["wardrobe"])
app.include_router(wardrobe_user_items.router, prefix="/api/wardrobe-user-items", tags=["wardrobe"])

# ── Basic items / materials / clothing types ──
# These are mounted at /api/ because paths are defined in the router
app.include_router(basic_items.router, prefix="/api", tags=["basic-items"])

# ── Outfits, looks, likes ──
app.include_router(outfits.router, prefix="/api/outfits", tags=["outfits"])
# looks router has full paths like /user-looks, /looks-sections
app.include_router(looks.router, prefix="/api", tags=["looks"])

# ── Limits & credits ──
app.include_router(limits.router, prefix="/api/limits", tags=["limits"])

# ── Recommendations ──
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])

# ── Payments ──
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])

# ── AI ──
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])

# ── Upload & files ──
app.include_router(upload.router, prefix="/api", tags=["upload"])

# ── Weather ──
app.include_router(weather.router, prefix="/api", tags=["weather"])

# ── Misc (check-limits, usage/log, pricing, etc.) ──
app.include_router(misc.router, prefix="/api", tags=["misc"])

# ── Admin ──
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

# ── Cron tasks ──
app.include_router(cron.router, prefix="/api/cron", tags=["cron"])
