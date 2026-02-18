from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    repos_base_path: str = "/tmp/vos-repos"
    debug: bool = False
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60
    csrf_enabled: bool = True

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
