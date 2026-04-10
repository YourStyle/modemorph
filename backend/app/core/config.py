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
    OPENROUTER_API_KEY: str = ""
    N8N_BASE_URL: str = ""
    AI_SERVICE_URL: str = ""

    # Yandex S3
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

    # Cron secret
    CRON_SECRET: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()


def validate_settings():
    """Call at startup to reject insecure defaults."""
    import sys
    errors = []
    if settings.JWT_SECRET == "change-me-in-production" or len(settings.JWT_SECRET) < 32:
        errors.append("JWT_SECRET is not set or too short (min 32 chars)")
    if not settings.TELEGRAM_PEPPER:
        errors.append("TELEGRAM_PEPPER is empty — Telegram auth is insecure")
    if errors:
        for e in errors:
            print(f"WARNING: {e}", file=sys.stderr)
