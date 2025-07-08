import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { Shell } from './components/Shell';

const program = new Command();

program
  .name('chorenzo')
  .version('0.1.0')
  .description('Open-source CLI engine for workspace analysis and automation')
  .showHelpAfterError();

program
  .command('init')
  .description('Initialize chorenzo workspace with recipe libraries')
  .option('--reset', 'Reset and reinitialize the workspace')
  .option('--no-analyze', 'Skip automatic workspace analysis')
  .option('-A', 'Alias for --no-analyze')
  .option('-y, --yes', 'Skip interactive confirmation')
  .option('--no-progress', 'Disable progress UI')
  .action(async (options) => {
    render(
      React.createElement(Shell, {
        command: 'init',
        options: {
          reset: options.reset,
          noAnalyze: options.noAnalyze || options.A,
          yes: options.yes,
          progress: options.progress
        }
      })
    );
  });

program
  .command('analyze')
  .description('Analyze your workspace structure and provide insights')
  .option('--no-progress', 'Disable progress UI')
  .action(async (options) => {
    render(
      React.createElement(Shell, {
        command: 'analyze',
        options: {
          progress: options.progress
        }
      })
    );
  });

const recipesCommand = program
  .command('recipes')
  .description('Manage and validate recipes');

recipesCommand
  .command('validate <target>')
  .description('Validate a recipe, recipe folder, library, or git repository')
  .option('--no-progress', 'Disable progress UI')
  .action(async (target, options) => {
    render(
      React.createElement(Shell, {
        command: 'recipes-validate',
        options: {
          target,
          progress: options.progress
        }
      })
    );
  });

program.parse();