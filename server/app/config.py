from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ORBI RESQ"
    app_version: str = "1.0.0"
    environment: str = "development"

    database_url: str = f"sqlite:///{DATA_DIR / 'orbi_resq.db'}"
    data_dir: str = str(DATA_DIR)

    cv_service_url: str = "http://127.0.0.1:8100"
    media_gateway_url: str = ""
    http_timeout_seconds: float = 8.0
    geocode_user_agent: str = "ORBI-RESQ/1.0 (road intelligence platform)"
    geocode_language: str = "en"

    default_radius_km: float = 25.0
    max_radius_km: float = 100.0
    max_discovery_results: int = 250

    enable_osm_discovery: bool = True
    osm_overpass_url: str = "https://overpass-api.de/api/interpreter"
    enable_caltrans_discovery: bool = True
    caltrans_district: str = "03"
    windy_api_key: str = ""
    camera_directory_url: str = ""

    storage_backend: str = "local"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    alert_sms_to: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    alert_email_to: str = ""

    seed_demo_data: bool = True
    max_upload_mb: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()
