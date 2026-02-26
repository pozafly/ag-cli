import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import dotenv from 'dotenv';

dotenv.config();

export const defaultConfig = {
  model: 'openai-codex/gpt-5.3-codex',
  endpoint: null,
  apiKeyEnv: 'OPENAI_API_KEY',
  artifactsDir: './artifacts',
  worker: {
    poolSize: 2,
    timeoutMs: 120000,
    defaultWorker: 'codex'
  },
  browser: {
    headless: true,
    slowMoMs: 0
  }
};

export function loadConfig(configPath = 'ag.config.yaml') {
  if (!fs.existsSync(configPath)) return { ...defaultConfig };
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw) || {};
  return {
    ...defaultConfig,
    ...parsed,
    worker: {
      ...defaultConfig.worker,
      ...(parsed.worker || {})
    },
    browser: {
      ...defaultConfig.browser,
      ...(parsed.browser || {})
    }
  };
}

export function saveSampleConfig(configPath = 'ag.config.yaml') {
  const sample = YAML.stringify(defaultConfig);
  fs.writeFileSync(configPath, sample, 'utf8');
}

export function resolveApiKey(config) {
  const key = process.env[config.apiKeyEnv];
  if (!key) {
    throw new Error(`API key not found. Set ${config.apiKeyEnv} or change apiKeyEnv in ag.config.yaml`);
  }
  return key;
}

export function ensureDir(dirPath) {
  const abs = path.resolve(dirPath);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}
