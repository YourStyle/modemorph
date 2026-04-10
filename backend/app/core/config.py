from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://modemorph:modemorph@postgres:5432/modemorph"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_PEPPER: str = ""

    # External services
    OPENROUTER_API_KEY: str = ""  # OpenRouter API key for AI generation
    N8N_BASE_URL: str = ""  # n8n webhook base URL (only for image gen)
    AI_SERVICE_URL: str = ""  # CLIP/FAISS service

    # Yandex S3 (env uses YANDEX_ACCESS_KEY_ID, not YANDEX_S3_*)
    YANDEX_ACCESS_KEY_ID: str = ""
    YANDEX_SECRET_ACCESS_KEY: str = ""
    YANDEX_BUCKET_NAME: str = "modemorphs3"
    YANDEX_S3_ENDPOINT: str = "https://storage.yandexcloud.net"

    # Robokassa
    ROBOKASSA_LOGIN: str = ""
    ROBOKASSA_PASS1: str = ""
    ROBOKASSA_PASS2: str = ""

    # OpenWeather
    OPENWEATHER_API_KEY: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
