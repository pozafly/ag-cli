import type { AppConfig } from './types.js';

export function findRiskyKeyword(goal: string, config: AppConfig): string | null {
  const list = config.approval?.riskyKeywords ?? [];
  const text = goal.toLowerCase();
  return list.find((k) => text.includes(k.toLowerCase())) ?? null;
}
