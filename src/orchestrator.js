import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { askModel } from './llm.js';
import { browserResearch } from './browser.js';
import { resolveApiKey, ensureDir } from './config.js';

const SYSTEM_PROMPT = `You are an autonomous software orchestrator inspired by agent-first IDEs.
Return concise, actionable output.
When planning: produce numbered task groups.
When executing: report completed, failed, next actions.`;

export async function plan(objective, config) {
  const sessionId = randomUUID().slice(0, 8);
  const apiKey = resolveApiKey(config);

  const output = await askModel({
    apiKey,
    model: config.model,
    endpoint: config.endpoint,
    prompt: `${SYSTEM_PROMPT}\n\nObjective: ${objective}\nCreate task groups with assignee hints.`
  });

  const lines = output
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

  const tasks = lines.map((goal, idx) => ({
    id: `TG-${idx + 1}`,
    goal,
    status: 'pending',
    assignee: 'agent-main',
    notes: []
  }));

  return {
    sessionId,
    objective,
    model: config.model,
    mode: 'planning',
    tasks,
    artifacts: [],
    latestOutput: output
  };
}

export async function runBrowserSubagent(url, config) {
  const data = await browserResearch(url, {
    headless: config.browser.headless,
    slowMoMs: config.browser.slowMoMs
  });

  const outDir = ensureDir(config.artifactsDir);
  const filename = `browser-research-${Date.now()}.json`;
  const fullPath = path.join(outDir, filename);

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');

  return {
    kind: 'browser-research',
    title: `Research: ${data.title}`,
    path: fullPath,
    summary: `Captured ${data.links.length} links from ${url}`
  };
}

export function saveState(state, config) {
  const outDir = ensureDir(config.artifactsDir);
  const fullPath = path.join(outDir, `run-${state.sessionId}.json`);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
  return fullPath;
}
