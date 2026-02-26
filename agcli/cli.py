from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from .config import load_config
from .orchestrator import plan, run_browser_subagent, save_state

app = typer.Typer(help="Antigravity-style orchestrator CLI")
console = Console()


@app.command()
def init(config_path: str = "ag.config.yaml"):
    sample = """model: openai-codex/gpt-5.3-codex
endpoint: null
api_key_env: OPENAI_API_KEY
artifacts_dir: ./artifacts
browser:
  headless: true
  slow_mo_ms: 0
"""
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(sample)
    console.print(f"[green]Wrote[/green] {config_path}")


@app.command()
def run(objective: str = typer.Argument(..., help="High-level objective")):
    cfg = load_config()
    state = plan(objective, cfg)
    state_file = save_state(state, cfg)

    table = Table(title=f"Session {state.session_id}")
    table.add_column("Task ID")
    table.add_column("Goal")
    for t in state.tasks:
        table.add_row(t.id, t.goal)

    console.print(table)
    console.print(f"\n[cyan]Planner output:[/cyan]\n{state.latest_output}")
    console.print(f"\n[green]Saved:[/green] {state_file}")


@app.command()
def browser(url: str = typer.Argument(..., help="URL to research with browser subagent")):
    cfg = load_config()
    artifact = run_browser_subagent(url, cfg)
    console.print(f"[green]Artifact saved:[/green] {artifact.path}")
    console.print(f"[cyan]{artifact.summary}[/cyan]")


if __name__ == "__main__":
    app()
