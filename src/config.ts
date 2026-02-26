import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import dotenv from 'dotenv';

import { AppError } from './errors.js';
import type { AppConfig } from './types.js';

dotenv.config();

export const defaultConfig: AppConfig = {
  model: 'openai-codex/gpt-5.3-codex',
  endpoint: null,
  apiKeyEnv: 'OPENAI_API_KEY',
  artifactsDir: './artifacts',
  worker: {
    poolSize: 2,
    timeoutMs: 120000,
    defaultWorker: 'codex',
    maxRetries: 1,
    retryBackoffMs: 500
  },
  approval: {
    enabled: true,
    strategy: 'prompt',
    riskyKeywords: ['rm -rf', 'drop table', 'delete from', 'truncate', 'sudo', 'ssh', 'scp']
  },
  review: {
    testCommand: 'npm test --silent',
    maxDiffChars: 12000
  },
  browser: {
    headless: true,
    slowMoMs: 0
  },
  manager: {
    routingStrategy: 'llm-hybrid'
  }
};

export function loadConfig(configPath = 'ag.config.yaml'): AppConfig {
  if (!fs.existsSync(configPath)) return structuredClone(defaultConfig);
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = (YAML.parse(raw) as Partial<AppConfig> | null) ?? {};
  return {
    ...defaultConfig,
    ...parsed,
    worker: { ...defaultConfig.worker, ...(parsed.worker ?? {}) },
    approval: { ...defaultConfig.approval, ...(parsed.approval ?? {}) },
    review: { ...defaultConfig.review, ...(parsed.review ?? {}) },
    browser: { ...defaultConfig.browser, ...(parsed.browser ?? {}) },
    manager: { ...defaultConfig.manager, ...(parsed.manager ?? {}) }
  };
}

export function saveSampleConfig(configPath = 'ag.config.yaml'): void {
  fs.writeFileSync(configPath, YAML.stringify(defaultConfig), 'utf8');
}

export function resolveApiKey(config: AppConfig): string {
  const key = process.env[config.apiKeyEnv];
  if (!key) {
    throw new AppError(`API key not found. Set ${config.apiKeyEnv} or change apiKeyEnv in ag.config.yaml`, 'MISSING_API_KEY');
  }
  return key;
}

export function ensureDir(dirPath: string): string {
  const abs = path.resolve(dirPath);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}
