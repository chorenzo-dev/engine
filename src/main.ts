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

program.parse();