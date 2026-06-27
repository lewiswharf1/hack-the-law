from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    GEMINI_API_KEY: str
    CELLAR_USERNAME: str
    CELLAR_PASSWORD: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOADS_DIR: str = "./uploads"
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    model_config = {"env_file": ".env"}


settings = Settings()
