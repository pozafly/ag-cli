from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional


class AgentMode(str, Enum):
    planning = "planning"
    execute = "execute"


class Task(BaseModel):
    id: str
    goal: str
    status: str = "pending"
    assignee: str = "agent-main"
    notes: List[str] = Field(default_factory=list)


class Artifact(BaseModel):
    kind: str
    title: str
    path: str
    summary: str = ""


class RunState(BaseModel):
    session_id: str
    objective: str
    model: str
    mode: AgentMode = AgentMode.planning
    tasks: List[Task] = Field(default_factory=list)
    artifacts: List[Artifact] = Field(default_factory=list)
    latest_output: Optional[str] = None
