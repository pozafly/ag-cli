import fs from 'node:fs';
import path from 'node:path';

import type { AppConfig, ExecuteOptions, RunState, TaskGroup, WorkerName } from './types.js';
import { ensureDir, resolveApiKey } from './config.js';
import { findRiskyKeyword } from './risk.js';
import { runWorkerTaskWithRetry } from './workers.js';
import { browserResearch } from './browser.js';
import { askModel } from './llm.js';

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

function parseRoleFromLlmOutput(output: string, roles: string[]): string | null {
  const roleLine = output
    .split('\n')
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith('role='));

  if (roleLine) {
    const value = roleLine.slice(roleLine.indexOf('=') + 1).trim().toLowerCase();
    const exact = roles.find((r) => r.toLowerCase() === value);
    if (exact) return exact;
  }

  const lowered = output.toLowerCase();
  return roles.find((r) => lowered.includes(r.toLowerCase())) ?? null;
}

async function routeRoleByLLM(task: TaskGroup, profiles: AgentProfile[], config: AppConfig): Promise<AgentProfile | null> {
  const roles = [...new Set(profiles.map((p) => p.role))];
  if (roles.length === 0) return null;

  const prompt = [
    '다음 태스크에 가장 적합한 역할을 하나만 고르세요.',
    `역할 후보: ${roles.join(', ')}`,
    `태스크: ${task.goal}`,
    '규칙: 반드시 한 줄만 출력하고 형식은 role=<역할명> 으로 제한하세요.'
  ].join('\n');

  try {
    const apiKey = resolveApiKey(config);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output = await askModel({
        apiKey,
        model: config.model,
        endpoint: config.endpoint,
        prompt
      });

      const role = parseRoleFromLlmOutput(output, roles);
      if (!role) continue;

      const matched = profiles
        .filter((p) => p.role === role)
        .sort((a, b) => b.priority - a.priority)[0];
      if (matched) return matched;
    }

    return null;
  } catch {
    return null;
  }
}

export async function assignRunTasksWithLLM(
  state: RunState,
  managerState: AgentManagerState,
  config: AppConfig
): Promise<TaskAssignment[]> {
  const rows: TaskAssignment[] = [];

  for (const task of state.tasks) {
    const llmProfile = await routeRoleByLLM(task, managerState.profiles, config);
    if (llmProfile) {
      rows.push({
        taskId: task.id,
        taskGoal: task.goal,
        profileId: llmProfile.id,
        worker: llmProfile.worker,
        reason: `llm-role=${llmProfile.role}, priority=${llmProfile.priority}`
      });
      continue;
    }

    const fallback = assignTask(task, managerState.profiles, config.worker.defaultWorker);
    rows.push({
      ...fallback,
      reason: `llm-fallback -> ${fallback.reason}`
    });
  }

  return rows;
}

export async function assignRunTasksByStrategy(
  state: RunState,
  managerState: AgentManagerState,
  config: AppConfig,
  strategy: string
): Promise<TaskAssignment[]> {
  if (strategy === 'heuristic') {
    return assignRunTasks(state, managerState, config);
  }
  return assignRunTasksWithLLM(state, managerState, config);
}

export function appendRunRecord(managerState: AgentManagerState, run: AgentRunRecord): AgentManagerState {
  return {
    ...managerState,
    runs: [run, ...managerState.runs].slice(0, 50)
  };
}

export interface AgentRuntime {
  worker: WorkerName;
  status: 'idle' | 'running';
  assigned: number;
  done: number;
  failed: number;
  blocked: number;
  retries: number;
  lastTaskId?: string;
}

export interface RoleRuntimeSummary {
  role: string;
  assigned: number;
  done: number;
  failed: number;
  blocked: number;
  retries: number;
}

export interface ManagerLoopSummary {
  total: number;
  done: number;
  failed: number;
  blocked: number;
  byWorker: AgentRuntime[];
  byRole: RoleRuntimeSummary[];
  routing: {
    strategy: string;
    llm: number;
    fallback: number;
    heuristic: number;
  };
}

function extractUrl(goal: string): string | null {
  const match = goal.match(/https?:\/\/\S+/i);
  return match?.[0] ?? null;
}

async function executeAssignedTask(task: TaskGroup, config: AppConfig, options: ExecuteOptions = {}): Promise<TaskGroup> {
  const startedAt = new Date().toISOString();

  if (config.approval.enabled) {
    const risky = findRiskyKeyword(task.goal, config);
    if (risky && !options.approveRisky) {
      return {
        ...task,
        status: 'blocked',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: `요청 승인 필요: 위험 키워드(${risky}) 감지`,
        approval: {
          required: true,
          reason: `risky-keyword:${risky}`
        }
      };
    }
  }

  if (task.assignee === 'browser') {
    const url = extractUrl(task.goal);
    if (!url) {
      return {
        ...task,
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: 'browser 태스크에 URL이 없어 실행할 수 없습니다.'
      };
    }

    const data = await browserResearch(url, config.browser);
    return {
      ...task,
      status: 'done',
      startedAt,
      finishedAt: new Date().toISOString(),
      result: {
        kind: 'browser',
        title: data.title,
        url,
        links: data.links.slice(0, 10)
      }
    };
  }

  const { result, attempts } = await runWorkerTaskWithRetry({
    worker: task.assignee,
    prompt: task.goal,
    timeoutMs: config.worker.timeoutMs,
    maxRetries: config.worker.maxRetries,
    retryBackoffMs: config.worker.retryBackoffMs
  });

  const success = result.code === 0 && !result.killedByTimeout;
  return {
    ...task,
    status: success ? 'done' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    result: {
      kind: 'worker',
      worker: task.assignee,
      exitCode: result.code,
      killedByTimeout: result.killedByTimeout,
      stdout: result.stdout,
      stderr: result.stderr,
      attempts
    }
  };
}

export async function runManagerCoreLoop(
  planned: RunState,
  managerState: AgentManagerState,
  config: AppConfig,
  options: ExecuteOptions = {},
  routingStrategy: string = config.manager.routingStrategy
): Promise<{ state: RunState; summary: ManagerLoopSummary; assignments: TaskAssignment[] }> {
  const assignments = await assignRunTasksByStrategy(planned, managerState, config, routingStrategy);
  const assignmentMap = new Map(assignments.map((x) => [x.taskId, x]));
  const routingSummary = assignments.reduce(
    (acc, row) => {
      if (row.reason.startsWith('llm-role=')) acc.llm += 1;
      else if (row.reason.startsWith('llm-fallback')) acc.fallback += 1;
      else acc.heuristic += 1;
      return acc;
    },
    { strategy: routingStrategy, llm: 0, fallback: 0, heuristic: 0 }
  );
  const roleByProfileId = new Map(managerState.profiles.map((x) => [x.id, x.role]));
  const queue: TaskGroup[] = planned.tasks.map((task) => {
    const matched = assignmentMap.get(task.id);
    return matched ? { ...task, assignee: matched.worker } : task;
  });

  const runtimes = new Map<WorkerName, AgentRuntime>();
  const roleSummary = new Map<string, RoleRuntimeSummary>();
  const running = new Set<Promise<void>>();
  const completed: TaskGroup[] = [];
  const maxConcurrency = Math.max(1, config.worker.poolSize);

  const upsertRuntime = (worker: WorkerName): AgentRuntime => {
    const current = runtimes.get(worker);
    if (current) return current;
    const next: AgentRuntime = {
      worker,
      status: 'idle',
      assigned: 0,
      done: 0,
      failed: 0,
      blocked: 0,
      retries: 0
    };
    runtimes.set(worker, next);
    return next;
  };

  const upsertRoleSummary = (taskId: string): RoleRuntimeSummary => {
    const assignment = assignmentMap.get(taskId);
    const role = (assignment ? roleByProfileId.get(assignment.profileId) : null) ?? 'unknown';
    const current = roleSummary.get(role);
    if (current) return current;
    const next: RoleRuntimeSummary = { role, assigned: 0, done: 0, failed: 0, blocked: 0, retries: 0 };
    roleSummary.set(role, next);
    return next;
  };

  const launch = (task: TaskGroup): void => {
    const runtime = upsertRuntime(task.assignee);
    const role = upsertRoleSummary(task.id);
    runtime.status = 'running';
    runtime.assigned += 1;
    runtime.lastTaskId = task.id;
    role.assigned += 1;

    const p = executeAssignedTask(task, config, options)
      .then((result) => {
        completed.push(result);
        const retries = result.result?.kind === 'worker' ? Math.max(0, (result.result.attempts ?? 1) - 1) : 0;
        runtime.retries += retries;
        role.retries += retries;

        if (result.status === 'done') {
          runtime.done += 1;
          role.done += 1;
        }
        if (result.status === 'failed') {
          runtime.failed += 1;
          role.failed += 1;
        }
        if (result.status === 'blocked') {
          runtime.blocked += 1;
          role.blocked += 1;
        }
      })
      .catch((err: unknown) => {
        runtime.failed += 1;
        role.failed += 1;
        completed.push({
          ...task,
          status: 'failed',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err)
        });
      })
      .finally(() => {
        runtime.status = 'idle';
        running.delete(p);
      });

    running.add(p);
  };

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < maxConcurrency) {
      const next = queue.shift();
      if (next) launch(next);
    }

    if (running.size > 0) {
      await Promise.race([...running]);
    }
  }

  const state: RunState = {
    ...planned,
    mode: 'execution',
    tasks: completed.sort((a, b) => a.id.localeCompare(b.id)),
    latestOutput: JSON.stringify(
      {
        summary: {
          total: completed.length,
          done: completed.filter((x) => x.status === 'done').length,
          failed: completed.filter((x) => x.status === 'failed').length,
          blocked: completed.filter((x) => x.status === 'blocked').length
        },
        byWorker: [...runtimes.values()],
        byRole: [...roleSummary.values()],
        routing: routingSummary
      },
      null,
      2
    )
  };

  const summary: ManagerLoopSummary = {
    total: state.tasks.length,
    done: state.tasks.filter((x) => x.status === 'done').length,
    failed: state.tasks.filter((x) => x.status === 'failed').length,
    blocked: state.tasks.filter((x) => x.status === 'blocked').length,
    byWorker: [...runtimes.values()],
    byRole: [...roleSummary.values()],
    routing: routingSummary
  };

  return { state, summary, assignments };
}

export function summarizeAgentManagerState(managerState: AgentManagerState): string {
  const latestRun = managerState.runs[0];
  const byRole = managerState.profiles.reduce(
    (acc, profile) => {
      acc[profile.role] = (acc[profile.role] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return [
    `버전: v${managerState.version}`,
    `프로필 수: ${managerState.profiles.length}`,
    `최근 실행 기록: ${managerState.runs.length}개`,
    latestRun ? `마지막 실행: ${latestRun.runId} (${latestRun.objective})` : '마지막 실행: 없음',
    `역할 분포: ${Object.entries(byRole)
      .map(([role, count]) => `${role}=${count}`)
      .join(', ')}`,
    ...managerState.profiles.map((p) => `- ${p.id} (${p.role}) -> ${p.worker}`)
  ].join('\n');
}
