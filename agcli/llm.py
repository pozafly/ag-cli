from __future__ import annotations

from openai import OpenAI


def _normalize_model(model: str) -> str:
    # ag-style alias compatibility
    aliases = {
        "codex": "gpt-5.3-codex",
        "quality": "gpt-5.3-codex",
        "fast": "gpt-5-mini",
    }
    return aliases.get(model, model)


def ask_model(api_key: str, model: str, prompt: str, endpoint: str | None = None) -> str:
    client = OpenAI(api_key=api_key, base_url=endpoint) if endpoint else OpenAI(api_key=api_key)
    real_model = _normalize_model(model)
    res = client.responses.create(
        model=real_model,
        input=prompt,
    )
    return res.output_text
