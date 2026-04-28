FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data/faiss_index /data/lightgcn /data/outfit_transformer /data/rembg
# rembg fetches its segmentation model into U2NET_HOME on first /clip/remove-bg
# call. Pinning to /data/rembg lets the docker volume keep it across restarts.
ENV U2NET_HOME=/data/rembg
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
