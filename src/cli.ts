#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { errorMessage } from './errors.js';
import { loadConfig, saveSampleConfig } from './config.js';
import {
  plan,
  executeTaskGroups,
  createReviewArtifact,
  runBrowserSubagent,
  delegateTaskToWorker,
  saveState
} from './orchestrator.js';
import { createCrossSurfaceVerificationHook } from './cross-surface.js';
import {
  appendRunRecord,
  assignRunTasksByStrategy,
  loadAgentManagerState,
  runManagerCoreLoop,
  saveAgentManagerState,
  summarizeAgentManagerState
} from './agent-manager.js';

const program = new Command();

program.name('ag').description('Antigravity-style orchestrator CLI (Node.js)').version('0.3.0');

program
  .command('init')
  .description('Create default ag.config.yaml')
  .option('-c, --config <path>', 'config path', 'ag.config.yaml')
  .action((opts: { config: string }) => {
    saveSampleConfig(opts.config);
    console.log(chalk.green(`Wrote ${opts.config}`));
  });

program
  .command('run')
  .description('Run planner with high-level objective')
  .argument('<objective>', 'high-level objective')
  .option('-e, --execute', 'execute planned task groups with worker pool')
  .option('--approve-risky', 'approve risky requests detected by approval gate')
  .action(async (objective: string, opts: { execute?: boolean; approveRisky?: boolean }) => {
    try {
      const config = loadConfig();
      const state = await plan(objective, config);
      const planPath = saveState(state, config, 'plan');

      console.log(chalk.cyan(`\nSession ${state.sessionId}`));
      for (const task of state.tasks) {
        console.log(`- ${task.id} [${task.assignee}]: ${task.goal}`);
      }
      console.log(chalk.yellow('\nPlanner output:\n'));
      console.log(state.latestOutput);
      console.log(chalk.green(`\nSaved plan: ${planPath}`));

      if (opts.execute) {
        const executed = await executeTaskGroups(state, config, { approveRisky: Boolean(opts.approveRisky) });
        const review = createReviewArtifact(executed, config);
        const enriched = { ...executed, artifacts: [...executed.artifacts, review] };
        const execPath = saveState(enriched, config, 'exec');
        console.log(chalk.yellow('\nExecution summary:\n'));
        for (const task of enriched.tasks) {
          console.log(`- ${task.id} [${task.assignee}] => ${task.status}`);
        }
        console.log(chalk.green(`\nSaved execution: ${execPath}`));
        console.log(chalk.green(`Saved review: ${review.path}`));
      }
    } catch (err) {
      console.error(chalk.red(errorMessage(err)));
      process.exit(1);
    }
  });

program
  .command('browser')
  .description('Run browser subagent research for URL')
  .argument('<url>', 'target url')
  .action(async (url: string) => {
    try {
      const config = loadConfig();
      const artifact = await runBrowserSubagent(url, config);
      console.log(chalk.green(`Artifact saved: ${artifact.path}`));
      console.log(chalk.cyan(artifact.summary));
    } catch (err) {
      console.error(chalk.red(errorMessage(err)));
      process.exit(1);
    }
  });

program
  .command('delegate')
  .description('Delegate a task to external worker CLI (claude/codex)')
  .requiredOption('-w, --worker <name>', 'worker name: claude|codex')
  .requiredOption('-p, --prompt <text>', 'task prompt')
  .option('-t, --timeout <ms>', 'timeout ms', '120000')
  .action(async (opts: { worker: string; prompt: string; timeout: string }) => {
    try {
      const config = loadConfig();
      const artifact = await delegateTaskToWorker(
        {
          worker: opts.worker,
          prompt: opts.prompt,
          timeoutMs: Number(opts.timeout)
        },
        config
      );
      console.log(chalk.green(`Artifact saved: ${artifact.path}`));
      console.log(chalk.cyan(artifact.summary));
    } catch (err) {
      console.error(chalk.red(errorMessage(err)));
      process.exit(1);
    }
  });

const manager = program.command('manager').description('에이전트 매니저 v1 제어');

manager
  .command('init')
  .description('에이전트 매니저 상태 파일 초기화')
  .action(() => {
    const config = loadConfig();
    const state = loadAgentManagerState(config);
    const savedPath = saveAgentManagerState(state, config);
    console.log(chalk.green(`초기화 완료: ${savedPath}`));
  });

manager
  .command('status')
  .description('에이전트 프로필/실행 기록 상태 확인')
  .action(() => {
    const config = loadConfig();
    const state = loadAgentManagerState(config);
    console.log(chalk.cyan(summarizeAgentManagerState(state)));
  });

manager
  .command('assign')
  .description('목표를 플래닝하고 에이전트 매니저 라우팅 결과를 확인')
  .argument('<objective>', 'high-level objective')
  .option('--routing <strategy>', 'routing strategy: heuristic|llm-hybrid')
  .action(async (objective: string, opts: { routing?: string }) => {
    try {
      const config = loadConfig();
      const managerState = loadAgentManagerState(config);
      const planned = await plan(objective, config);
      const routing = opts.routing ?? config.manager.routingStrategy;
      const assignments = await assignRunTasksByStrategy(planned, managerState, config, routing);

      for (const task of planned.tasks) {
        const matched = assignments.find((a) => a.taskId === task.id);
        if (matched) task.assignee = matched.worker;
      }

      const runRecord = {
        runId: planned.sessionId,
        createdAt: new Date().toISOString(),
        objective,
        assignmentCount: assignments.length
      };
      const nextState = appendRunRecord(managerState, runRecord);
      const statePath = saveAgentManagerState(nextState, config);
      const planPath = saveState(planned, config, 'manager-plan');

      console.log(chalk.cyan(`\nSession ${planned.sessionId}`));
      console.log(`- routing=${routing}`);
      assignments.forEach((row) => {
        console.log(`- ${row.taskId}: ${row.profileId} -> ${row.worker} (${row.reason})`);
      });
      console.log(chalk.green(`\nSaved manager: ${statePath}`));
      console.log(chalk.green(`Saved plan: ${planPath}`));
    } catch (err) {
      console.error(chalk.red(errorMessage(err)));
      process.exit(1);
    }
  });

manager
  .command('run')
  .description('에이전트 매니저 핵심 루프로 배정+실행+집계를 수행')
  .argument('<objective>', 'high-level objective')
  .option('--approve-risky', 'approve risky requests detected by approval gate')
  .option('--routing <strategy>', 'routing strategy: heuristic|llm-hybrid')
  .action(async (objective: string, opts: { approveRisky?: boolean; routing?: string }) => {
    try {
      const config = loadConfig();
      const managerState = loadAgentManagerState(config);
      const planned = await plan(objective, config);
      const routing = opts.routing ?? config.manager.routingStrategy;

      const { state: executed, summary, assignments } = await runManagerCoreLoop(
        planned,
        managerState,
        config,
        {
          approveRisky: Boolean(opts.approveRisky)
        },
        routing
      );

      const runRecord = {
        runId: planned.sessionId,
        createdAt: new Date().toISOString(),
        objective,
        assignmentCount: assignments.length
      };
      const nextState = appendRunRecord(managerState, runRecord);
      const statePath = saveAgentManagerState(nextState, config);
      const execPath = saveState(executed, config, 'manager-exec');
      const review = createReviewArtifact(executed, config);
      const crossSurface = createCrossSurfaceVerificationHook(executed, config);

      console.log(chalk.cyan(`\nSession ${planned.sessionId}`));
      console.log(`- routing=${routing}`);
      console.log(`- 총 태스크: ${summary.total}`);
      console.log(`- 완료: ${summary.done}, 실패: ${summary.failed}, 보류: ${summary.blocked}`);
      console.log(
        `- routing-summary: llm=${summary.routing.llm}, fallback=${summary.routing.fallback}, heuristic=${summary.routing.heuristic}`
      );
      summary.byWorker.forEach((agent) => {
        console.log(
          `- worker=${agent.worker} assigned=${agent.assigned} done=${agent.done} failed=${agent.failed} blocked=${agent.blocked} retries=${agent.retries}`
        );
      });
      summary.byRole.forEach((role) => {
        console.log(
          `- role=${role.role} assigned=${role.assigned} done=${role.done} failed=${role.failed} blocked=${role.blocked} retries=${role.retries}`
        );
      });
      console.log(chalk.green(`\nSaved manager: ${statePath}`));
      console.log(chalk.green(`Saved execution: ${execPath}`));
      console.log(chalk.green(`Saved review: ${review.path}`));
      console.log(chalk.green(`Saved cross-surface hook: ${crossSurface.path}`));
    } catch (err) {
      console.error(chalk.red(errorMessage(err)));
      process.exit(1);
    }
  });

program.parse(process.argv);
