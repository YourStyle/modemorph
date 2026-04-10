from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, health, wardrobe, limits, recommendations, outfits, payments, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="ModeMorph API",
    version="2.0.0",
    description="ModeMorph backend — PostgreSQL + FastAPI replacing Supabase",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(wardrobe.router, prefix="/api/wardrobe", tags=["wardrobe"])
app.include_router(limits.router, prefix="/api/limits", tags=["limits"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(outfits.router, prefix="/api/outfits", tags=["outfits"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
