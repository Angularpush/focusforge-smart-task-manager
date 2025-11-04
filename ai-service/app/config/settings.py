"""
Configuration settings for the FocusForge AI Service.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings with validation."""

    # Service Configuration
    environment: str = "development"
    port: int = 8000
    host: str = "0.0.0.0"
    debug: bool = True

    # Database Configuration
    mongodb_url: str = "mongodb://localhost:27017/focusforge"
    mongodb_database: str = "focusforge"

    # Redis Configuration
    redis_url: str = "redis://localhost:6379"
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: Optional[str] = None
    redis_db: int = 0

    # AI Model Configuration
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-3.5-turbo"
    openai_max_tokens: int = 1000
    openai_temperature: float = 0.7
    openai_timeout: int = 30

    # Ollama Configuration
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    ollama_enabled: bool = False

    # LangChain Configuration
    langchain_verbose: bool = True
    langchain_debug: bool = False
    langchain_tracing_v2: bool = False

    # Vector Database Configuration
    pinecone_api_key: Optional[str] = None
    pinecone_environment: str = "us-west1-gcp"
    pinecone_index_name: str = "focusforge"
    embedding_model: str = "text-embedding-ada-002"
    embedding_dimension: int = 1536

    # NLP Configuration
    spacy_model: str = "en_core_web_sm"
    dateparser_settings: str = '{"PREFER_DATES_FROM":"future","STRICT_PARSING":false}'
    task_parsing_confidence_threshold: float = 0.8

    # Chat Configuration
    chat_max_history: int = 20
    chat_context_window: int = 10
    chat_memory_type: str = "buffer"  # buffer, summary, or vector
    chat_max_tokens: int = 500
    chat_temperature: float = 0.7

    # Scheduling Engine Configuration
    scheduling_urgency_weight: float = 0.4
    scheduling_complexity_weight: float = 0.3
    scheduling_fatigue_weight: float = 0.2
    scheduling_dependency_weight: float = 0.1
    scheduling_max_tasks_per_day: int = 8
    scheduling_default_task_duration: int = 60  # minutes

    # Redis Pub/Sub Channels
    redis_chat_channel_prefix: str = "chat"
    redis_task_channel_prefix: str = "task"
    redis_status_channel_prefix: str = "status"

    # Logging Configuration
    log_level: str = "DEBUG"
    log_format: str = "json"
    log_file_enabled: bool = True
    log_file_path: str = "./logs/ai-service.log"

    # Security Configuration
    api_key_header: str = "X-API-Key"
    api_key: Optional[str] = None
    cors_origins: str = "http://localhost:3001,http://localhost:3000"

    # Performance Configuration
    max_concurrent_requests: int = 10
    request_timeout: int = 30
    cache_ttl: int = 3600  # seconds

    # Feature Flags
    enable_task_parsing: bool = True
    enable_chat_responses: bool = True
    enable_scheduling: bool = True
    enable_memory_persistence: bool = True
    enable_analytics: bool = True

    # Development Settings
    dev_mode: bool = True
    dev_mock_responses: bool = False
    dev_log_requests: bool = True
    dev_save_interactions: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Create global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get the application settings."""
    return settings


# Development/Production helpers
def is_development() -> bool:
    """Check if running in development mode."""
    return settings.environment.lower() == "development"


def is_production() -> bool:
    """Check if running in production mode."""
    return settings.environment.lower() == "production"


def is_testing() -> bool:
    """Check if running in testing mode."""
    return settings.environment.lower() == "test"


# AI Provider helpers
def use_openai() -> bool:
    """Check if OpenAI should be used."""
    return bool(settings.openai_api_key) and not settings.ollama_enabled


def use_ollama() -> bool:
    """Check if Ollama should be used."""
    return settings.ollama_enabled


def get_model_provider() -> str:
    """Get the active AI model provider."""
    if use_ollama():
        return "ollama"
    elif use_openai():
        return "openai"
    else:
        return "mock"  # Fallback for development


# Logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": settings.log_level,
            "formatter": "json" if settings.log_format == "json" else "default",
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": settings.log_level,
            "formatter": "json" if settings.log_format == "json" else "default",
            "filename": settings.log_file_path,
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5,
            "encoding": "utf8",
        } if settings.log_file_enabled else None,
    },
    "loggers": {
        "": {
            "level": settings.log_level,
            "handlers": ["console"] + (["file"] if settings.log_file_enabled else []),
        },
        "uvicorn": {
            "level": "INFO",
            "handlers": ["console"] + (["file"] if settings.log_file_enabled else []),
            "propagate": False,
        },
        "fastapi": {
            "level": "INFO",
            "handlers": ["console"] + (["file"] if settings.log_file_enabled else []),
            "propagate": False,
        },
    },
}

# Remove None handler
if LOGGING_CONFIG["handlers"]["file"] is None:
    del LOGGING_CONFIG["handlers"]["file"]
    for logger_config in LOGGING_CONFIG["loggers"].values():
        if "file" in logger_config["handlers"]:
            logger_config["handlers"].remove("file")