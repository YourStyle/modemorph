from contextlib import asynccontextmanager
from fastapi import FastAPI
from clip.encoder import CLIPEncoderService
from clip.index import FAISSIndexService
from clip.routes import router as clip_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.encoder = CLIPEncoderService()
    app.state.faiss_index = FAISSIndexService()
    yield


app = FastAPI(title='ModeMorph AI', version='1.0.0', lifespan=lifespan)
app.include_router(clip_router, prefix='/clip')


@app.get('/health')
def health():
    return {'status': 'ok'}
