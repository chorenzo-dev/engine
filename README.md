# Chorenzo Engine

Open-source CLI engine that automates your engineering workflow with AI-powered workspace analysis.

## Usage

### Initialize Workspace

Initialize your Chorenzo workspace and download recipe libraries:

```bash
# Initialize workspace with recipe libraries
npx @chorenzo/engine init

# Reset workspace and re-initialize
npx @chorenzo/engine init --reset
```

### Analyze Command

Analyze your workspace and get detailed insights about project structure, dependencies, and ecosystems:

```bash
# With progress UI (default)
npx @chorenzo/engine analyze

# Simple text output without progress UI
npx @chorenzo/engine analyze --no-progress
```

### Recipes Command

Validate and manage Chorenzo recipes:

```bash
# Validate a recipe by name
npx @chorenzo/engine recipes validate code-formatting

# Validate a local recipe folder
npx @chorenzo/engine recipes validate ./my-recipe

# Validate an entire recipe library
npx @chorenzo/engine recipes validate ~/.chorenzo/recipes/core

# Validate recipes from a git repository
npx @chorenzo/engine recipes validate https://github.com/chorenzo-dev/recipes-core.git
```

Chorenzo uses atomic, composable automation recipes to handle workspace setup and configuration. See our [recipes documentation](docs/recipes.md) for detailed information about creating and using recipes.

### Help

```bash
# Show all available commands
npx @chorenzo/engine --help

# Show help for specific command
npx @chorenzo/engine analyze --help
```

## Requirements

- Node.js 18+ 
- Git repository (workspace must be in a Git repository)
- Claude Code API access

## License

Apache-2.0
