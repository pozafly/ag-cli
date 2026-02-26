#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { loadConfig, saveSampleConfig } from './config.js';
import { plan, executeTaskGroups, createReviewArtifact, runBrowserSubagent, delegateTaskToWorker, saveState } from './orchestrator.js';

const program = new Command();

program
  .name('ag')
  .description('Antigravity-style orchestrator CLI (Node.js)')
  .version('0.2.0');

program
  .command('init')
  .description('Create default ag.config.yaml')
  .option('-c, --config <path>', 'config path', 'ag.config.yaml')
  .action((opts) => {
    saveSampleConfig(opts.config);
    console.log(chalk.green(`Wrote ${opts.config}`));
  });

program
  .command('run')
  .description('Run planner with high-level objective')
  .argument('<objective>', 'high-level objective')
  .option('-e, --execute', 'execute planned task groups with worker pool')
  .option('--approve-risky', 'approve risky requests detected by approval gate')
  .action(async (objective, opts) => {
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
        const execPath = saveState(executed, config, 'exec');
        const review = createReviewArtifact(executed, config);
        console.log(chalk.yellow('\nExecution summary:\n'));
        for (const task of executed.tasks) {
          console.log(`- ${task.id} [${task.assignee}] => ${task.status}`);
        }
        console.log(chalk.green(`\nSaved execution: ${execPath}`));
        console.log(chalk.green(`Saved review: ${review.path}`));
      }
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

program
  .command('browser')
  .description('Run browser subagent research for URL')
  .argument('<url>', 'target url')
  .action(async (url) => {
    try {
      const config = loadConfig();
      const artifact = await runBrowserSubagent(url, config);
      console.log(chalk.green(`Artifact saved: ${artifact.path}`));
      console.log(chalk.cyan(artifact.summary));
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

program
  .command('delegate')
  .description('Delegate a task to external worker CLI (claude/codex)')
  .requiredOption('-w, --worker <name>', 'worker name: claude|codex')
  .requiredOption('-p, --prompt <text>', 'task prompt')
  .option('-t, --timeout <ms>', 'timeout ms', '120000')
  .action(async (opts) => {
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
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

program.parse(process.argv);
