import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';

import { extractErrorMessage } from '~/utils/error.utils';
import { Logger } from '~/utils/logger.utils';

import packageJson from '../package.json' with { type: 'json' };
import { Shell } from './Shell';

const program = new Command();

program
  .name('chorenzo')
  .version(packageJson.version)
  .description('Open-source CLI engine for workspace analysis and automation')
  .showHelpAfterError();

program
  .command('init')
  .description('Initialize chorenzo workspace with recipe libraries')
  .option('--reset', 'Reset and reinitialize the workspace')
  .option('--no-analyze', 'Skip automatic workspace analysis')
  .option('-A', 'Alias for --no-analyze')
  .option('-y, --yes', 'Skip interactive confirmation')
  .option('--debug', 'Show all progress messages in list format')
  .option('--cost', 'Show LLM cost information')
  .action(async (options) => {
    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'init',
        options: {
          reset: options.reset,
          noAnalyze: !options.analyze || options.A,
          yes: options.yes,
          debug: options.debug,
          cost: options.cost,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze your workspace structure and provide insights')
  .option('--debug', 'Show all progress messages in list format')
  .option('--cost', 'Show LLM cost information')
  .action(async (options) => {
    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'analyze',
        options: {
          debug: options.debug,
          cost: options.cost,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

const recipesCommand = program
  .command('recipes')
  .description('Manage and validate Chorenzo recipes')
  .addHelpText(
    'after',
    `
Examples:
  $ chorenzo recipes show code-formatting                  # Show recipe details
  $ chorenzo recipes validate code-formatting              # Validate by recipe name
  $ chorenzo recipes validate ./my-recipe                  # Validate local recipe folder
  $ chorenzo recipes validate ~/.chorenzo/recipes/core     # Validate entire library
  $ chorenzo recipes validate https://github.com/user/chorenzo-recipes.git
  
  $ chorenzo recipes apply code-formatting                 # Apply by recipe name
  $ chorenzo recipes apply code-formatting --variant prettier
  $ chorenzo recipes apply testing-setup --project apps/web
`
  );

recipesCommand
  .command('validate <target>')
  .description('Validate recipes by name, path, library, or git repository')
  .option('--debug', 'Show all progress messages in list format')
  .addHelpText(
    'after',
    `
Arguments:
  target    Recipe name, local path, or git URL

Examples:
  $ chorenzo recipes validate code-formatting
  $ chorenzo recipes validate ~/my-recipes/custom-recipe
  $ chorenzo recipes validate ~/.chorenzo/recipes/core
  $ chorenzo recipes validate https://github.com/chorenzo-dev/recipes-core.git
`
  )
  .action(async (target, options) => {
    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'recipes-validate',
        options: {
          target,
          debug: options.debug,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

recipesCommand
  .command('apply <recipe>')
  .description('Apply a recipe to the workspace')
  .option('--variant <id>', 'Specific variant to use')
  .option('--project <path>', 'Apply to specific project only')
  .option('-y, --yes', 'Skip interactive confirmations')
  .option('--force', 'Bypass re-application warnings (alias for --yes)')
  .option('--debug', 'Show all progress messages in list format')
  .option('--cost', 'Show LLM cost information')
  .addHelpText(
    'after',
    `
Arguments:
  recipe    Recipe name or local folder path

Examples:
  $ chorenzo recipes apply code-formatting                    # Apply by recipe name
  $ chorenzo recipes apply ./my-recipe                       # Apply local recipe
  $ chorenzo recipes apply code-formatting --variant prettier
  $ chorenzo recipes apply testing-setup --project apps/web
  $ chorenzo recipes apply eslint-config -y                  # Skip confirmations
  $ chorenzo recipes apply docker-setup --force             # Force re-application
`
  )
  .action(async (recipe, options) => {
    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'recipes-apply',
        options: {
          recipe,
          variant: options.variant,
          project: options.project,
          yes: options.yes || options.force,
          debug: options.debug,
          cost: options.cost,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

recipesCommand
  .command('show <recipe-name>')
  .description('Show detailed information about a recipe')
  .option('--debug', 'Show all progress messages in list format')
  .addHelpText(
    'after',
    `
Arguments:
  recipe-name    Name of the recipe to display information for

Examples:
  $ chorenzo recipes show code-formatting               # Show details for code-formatting recipe
  $ chorenzo recipes show testing-setup                # Show details for testing-setup recipe
`
  )
  .action(async (recipeName, options) => {
    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'recipes-show',
        options: {
          recipeName,
          debug: options.debug,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

recipesCommand
  .command('generate [name]')
  .description('Generate a new recipe')
  .option('--debug', 'Show all progress messages in list format')
  .option('--cost', 'Show LLM cost information')
  .option(
    '--location <path>',
    'Custom save location (supports ~ for home directory)'
  )
  .option('--category <category>', 'Recipe category')
  .option('--summary <summary>', 'Recipe summary')
  .option(
    '--ecosystem-agnostic',
    'Create recipe that works across multiple ecosystems'
  )
  .option(
    '--ecosystem-specific',
    'Create recipe for specific ecosystems (opposite of --ecosystem-agnostic)'
  )
  .option('--magic-generate', 'Generate recipe content using AI (uses Claude)')
  .option(
    '--additional-instructions <instructions>',
    'Additional instructions for AI generation (requires --magic-generate)'
  )
  .addHelpText(
    'after',
    `
Arguments:  
  name      Recipe name (optional, will prompt if not provided)

Examples:
  $ chorenzo recipes generate                               # Interactive generation
  $ chorenzo recipes generate code-formatting               # Generate with name
  $ chorenzo recipes generate linting --category tools --summary "Set up ESLint and Prettier with TypeScript support for consistent code formatting"
  $ chorenzo recipes generate testing --location ~/my-recipes --category development --summary "Configure Jest testing framework with coverage reporting and TypeScript integration"
  $ chorenzo recipes generate docker --ecosystem-agnostic --category infrastructure --summary "Add Docker support for any project type"
  $ chorenzo recipes generate typescript --ecosystem-specific --category tools --summary "Set up TypeScript configuration for JavaScript projects"
  $ chorenzo recipes generate auth --magic-generate --category security --summary "Implement authentication system"
  $ chorenzo recipes generate api --magic-generate --additional-instructions "Use FastAPI with async support" --summary "Create REST API endpoints"
`
  )
  .action(async (name, options) => {
    if (options.ecosystemAgnostic && options.ecosystemSpecific) {
      console.error(
        'Error: Cannot use both --ecosystem-agnostic and --ecosystem-specific flags together'
      );
      process.exit(1);
    }

    let ecosystemAgnostic = options.ecosystemAgnostic;
    if (options.ecosystemSpecific !== undefined) {
      ecosystemAgnostic = !options.ecosystemSpecific;
    }

    const { waitUntilExit } = render(
      React.createElement(Shell, {
        command: 'recipes-generate',
        options: {
          name,
          debug: options.debug,
          cost: options.cost,
          saveLocation: options.location,
          category: options.category,
          summary: options.summary,
          ecosystemAgnostic,
          magicGenerate: options.magicGenerate,
          additionalInstructions: options.additionalInstructions,
        },
      })
    );

    try {
      await waitUntilExit();
    } catch (error) {
      Logger.error(extractErrorMessage(error));
      process.exit(1);
    }
  });

program.parse();
