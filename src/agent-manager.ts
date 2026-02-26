import fs from 'node:fs';
import path from 'node:path';

import type { AppConfig, RunState, TaskGroup, WorkerName } from './types.js';
import { ensureDir } from './config.js';

export interface AgentProfile {
  id: string;
  role: string;
  worker: WorkerName;
  priority: number;
  description: string;
  routingKeywords: string[];
}

export interface TaskAssignment {
  taskId: string;
  taskGoal: string;
  profileId: string;
  worker: WorkerName;
  reason: string;
}

export interface AgentRunRecord {
  runId: string;
  createdAt: string;
  objective: string;
  assignmentCount: number;
}

export interface AgentManagerState {
  version: 1;
  updatedAt: string;
  profiles: AgentProfile[];
  runs: AgentRunRecord[];
}

const MANAGER_FILENAME = 'agent-manager-v1.json';

function defaultProfiles(defaultWorker: WorkerName): AgentProfile[] {
  return [
    {
      id: 'planner-core',
      role: 'planner',
      worker: defaultWorker,
      priority: 100,
      description: '상위 목표를 실행 가능한 Task Group으로 분해한다.',
      routingKeywords: ['plan', '기획', '분해', 'task group']
    },
    {
      id: 'executor-codex',
      role: 'executor',
      worker: 'codex',
      priority: 90,
      description: '코드 변경, 리팩터링, 테스트 실행을 담당한다.',
      routingKeywords: ['코드', '구현', '리팩터링', 'test', 'fix']
    },
    {
      id: 'reviewer-claude',
      role: 'reviewer',
      worker: 'claude',
      priority: 70,
      description: '리뷰, 문서 정리, 위험도 점검을 담당한다.',
      routingKeywords: ['리뷰', '문서', '요약', 'risk']
    },
    {
      id: 'research-browser',
      role: 'researcher',
      worker: 'browser',
      priority: 80,
      description: 'URL 탐색/레퍼런스 수집 기반 리서치를 담당한다.',
      routingKeywords: ['http://', 'https://', '사이트', '웹', 'browser', 'url']
    }
  ];
}

function statePath(config: AppConfig): string {
  const outDir = ensureDir(config.artifactsDir);
  return path.join(outDir, MANAGER_FILENAME);
}

export function loadAgentManagerState(config: AppConfig): AgentManagerState {
  const file = statePath(config);
  if (!fs.existsSync(file)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      profiles: defaultProfiles(config.worker.defaultWorker),
      runs: []
    };
  }

  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as AgentManagerState;
}

export function saveAgentManagerState(state: AgentManagerState, config: AppConfig): string {
  const file = statePath(config);
  const enriched: AgentManagerState = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(file, JSON.stringify(enriched, null, 2), 'utf8');
  return file;
}

function profileScore(profile: AgentProfile, goal: string): number {
  const text = goal.toLowerCase();
  const keywordHits = profile.routingKeywords.filter((kw) => text.includes(kw.toLowerCase())).length;
  return profile.priority + keywordHits * 20;
}

function fallbackProfile(profiles: AgentProfile[], defaultWorker: WorkerName): AgentProfile {
  const byDefault = profiles.find((p) => p.worker === defaultWorker);
  if (byDefault) return byDefault;

  const first = profiles.slice().sort((a, b) => b.priority - a.priority)[0];
  if (!first) {
    throw new Error('에이전트 프로필이 비어 있어 라우팅할 수 없습니다.');
  }
  return first;
}

export function assignTask(task: TaskGroup, profiles: AgentProfile[], defaultWorker: WorkerName): TaskAssignment {
  const sorted = profiles
    .map((profile) => ({ profile, score: profileScore(profile, task.goal) }))
    .sort((a, b) => b.score - a.score);

  const selected = sorted[0]?.profile ?? fallbackProfile(profiles, defaultWorker);
  return {
    taskId: task.id,
    taskGoal: task.goal,
    profileId: selected.id,
    worker: selected.worker,
    reason: `role=${selected.role}, priority=${selected.priority}`
  };
}

export function assignRunTasks(state: RunState, managerState: AgentManagerState, config: AppConfig): TaskAssignment[] {
  return state.tasks.map((task) => assignTask(task, managerState.profiles, config.worker.defaultWorker));
}

export function appendRunRecord(managerState: AgentManagerState, run: AgentRunRecord): AgentManagerState {
  return {
    ...managerState,
    runs: [run, ...managerState.runs].slice(0, 50)
  };
}

export function summarizeAgentManagerState(managerState: AgentManagerState): string {
  return [
    `버전: v${managerState.version}`,
    `프로필 수: ${managerState.profiles.length}`,
    `최근 실행 기록: ${managerState.runs.length}개`,
    ...managerState.profiles.map((p) => `- ${p.id} (${p.role}) -> ${p.worker}`)
  ].join('\n');
}
