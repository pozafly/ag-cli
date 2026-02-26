#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { loadConfig, saveSampleConfig } from './config.js';
import { plan, runBrowserSubagent, saveState } from './orchestrator.js';

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
  .action(async (objective) => {
    try {
      const config = loadConfig();
      const state = await plan(objective, config);
      const statePath = saveState(state, config);

      console.log(chalk.cyan(`\nSession ${state.sessionId}`));
      for (const task of state.tasks) {
        console.log(`- ${task.id}: ${task.goal}`);
      }
      console.log(chalk.yellow('\nPlanner output:\n'));
      console.log(state.latestOutput);
      console.log(chalk.green(`\nSaved: ${statePath}`));
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

program.parse(process.argv);
