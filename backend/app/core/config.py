import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Waste2Value API"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "sqlite:///./waste2value.db"
    
    # Tolerances
    DEFAULT_MASS_TOLERANCE_PERCENT: float = 2.0
    MAX_ALLOWABLE_SHREDDING_LOSS_PERCENT: float = 5.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
