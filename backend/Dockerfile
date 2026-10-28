FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

# Trust X-Forwarded-For from Caddy (it overwrites the header from clients; the port
# is bound to 127.0.0.1 on the host). Without this every request looks like it
# comes from Caddy's container IP, so slowapi limits like /api/auth/refresh 30/min
# were one bucket shared by all users.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--forwarded-allow-ips", "*"]
