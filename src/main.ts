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
          noAnalyze: !options.analyze || options.A,
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
  .description('Manage and validate Chorenzo recipes')
  .addHelpText('after', `
Examples:
  $ chorenzo recipes validate code-formatting              # Validate by recipe name
  $ chorenzo recipes validate ./my-recipe                  # Validate local recipe folder
  $ chorenzo recipes validate ~/.chorenzo/recipes/core     # Validate entire library
  $ chorenzo recipes validate https://github.com/user/chorenzo-recipes.git
`);

recipesCommand
  .command('validate <target>')
  .description('Validate recipes by name, path, library, or git repository')
  .option('--no-progress', 'Disable progress UI')
  .addHelpText('after', `
Arguments:
  target    Recipe name, local path, or git URL

Examples:
  $ chorenzo recipes validate code-formatting
  $ chorenzo recipes validate ~/my-recipes/custom-recipe
  $ chorenzo recipes validate ~/.chorenzo/recipes/core
  $ chorenzo recipes validate https://github.com/chorenzo-dev/recipes-core.git
`)
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

recipesCommand
  .command('apply <recipe>')
  .description('Apply a recipe to the workspace')
  .option('--variant <id>', 'Specific variant to use')
  .option('--project <path>', 'Apply to specific project only')
  .option('-y, --yes', 'Skip interactive confirmations')
  .option('--no-progress', 'Disable progress UI')
  .addHelpText('after', `
Arguments:
  recipe    Recipe name or local folder path

Examples:
  $ chorenzo recipes apply code-formatting                    # Apply by recipe name
  $ chorenzo recipes apply ./my-recipe                       # Apply local recipe
  $ chorenzo recipes apply code-formatting --variant prettier
  $ chorenzo recipes apply testing-setup --project apps/web
  $ chorenzo recipes apply eslint-config -y                  # Skip confirmations
`)
  .action(async (recipe, options) => {
    render(
      React.createElement(Shell, {
        command: 'recipes-apply',
        options: {
          recipe,
          variant: options.variant,
          project: options.project,
          yes: options.yes,
          progress: options.progress
        }
      })
    );
  });

program.parse();