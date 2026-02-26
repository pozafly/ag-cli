from __future__ import annotations

from pathlib import Path
import os
import yaml
from pydantic import BaseModel, Field


class BrowserConfig(BaseModel):
    headless: bool = True
    slow_mo_ms: int = 0


class AppConfig(BaseModel):
    model: str = "openai-codex/gpt-5.3-codex"
    endpoint: str | None = None
    api_key_env: str = "OPENAI_API_KEY"
    artifacts_dir: str = "./artifacts"
    browser: BrowserConfig = Field(default_factory=BrowserConfig)


def load_config(path: str = "ag.config.yaml") -> AppConfig:
    p = Path(path)
    if not p.exists():
        return AppConfig()
    data = yaml.safe_load(p.read_text()) or {}
    return AppConfig(**data)


def resolve_api_key(config: AppConfig) -> str:
    key = os.getenv(config.api_key_env)
    if not key:
        raise RuntimeError(
            f"API key not found. Set {config.api_key_env} or edit ag.config.yaml(api_key_env)."
        )
    return key
