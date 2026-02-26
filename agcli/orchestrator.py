from __future__ import annotations

from datetime import datetime
from pathlib import Path
import json
import uuid

from .models import RunState, Task, Artifact, AgentMode
from .llm import ask_model
from .browser import browser_research
from .config import AppConfig, resolve_api_key


SYSTEM_PROMPT = """
You are an autonomous software orchestrator inspired by agent-first IDEs.
Return concise, actionable output.
When planning: produce numbered task groups.
When executing: report completed, failed, next actions.
""".strip()


def _ensure_dir(path: str) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def plan(objective: str, config: AppConfig) -> RunState:
    sid = str(uuid.uuid4())[:8]
    state = RunState(session_id=sid, objective=objective, model=config.model, mode=AgentMode.planning)
    key = resolve_api_key(config)
    prompt = f"{SYSTEM_PROMPT}\n\nObjective: {objective}\nCreate task groups with assignee hints."
    out = ask_model(key, config.model, prompt, config.endpoint)
    state.latest_output = out
    for i, line in enumerate([x.strip() for x in out.splitlines() if x.strip()][:8], start=1):
        state.tasks.append(Task(id=f"TG-{i}", goal=line, assignee="agent-main"))
    return state


def run_browser_subagent(url: str, config: AppConfig) -> Artifact:
    data = browser_research(url, headless=config.browser.headless, slow_mo_ms=config.browser.slow_mo_ms)
    out_dir = _ensure_dir(config.artifacts_dir)
    filename = f"browser-research-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    path = out_dir / filename
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return Artifact(
        kind="browser-research",
        title=f"Research: {data['title']}",
        path=str(path),
        summary=f"Captured {len(data['links'])} links from {url}",
    )


def save_state(state: RunState, config: AppConfig) -> Path:
    out_dir = _ensure_dir(config.artifacts_dir)
    path = out_dir / f"run-{state.session_id}.json"
    path.write_text(state.model_dump_json(indent=2))
    return path
