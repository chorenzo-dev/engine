# Chorenzo Engine

Open-source CLI engine that automates your engineering workflow with AI-powered workspace analysis and recipe application.

## Usage

### Initialize Workspace

Initialize your Chorenzo workspace and download recipe libraries:

```bash
# Initialize workspace with recipe libraries
npx chorenzo init

# Reset workspace and re-initialize
npx chorenzo init --reset
```

### Analyze Command

Analyze your workspace and get detailed insights about project structure, dependencies, and ecosystems:

```bash
# With progress UI (default)
npx chorenzo analyze

# Simple text output without progress UI
npx chorenzo analyze --no-progress

# Show LLM cost information
npx chorenzo analyze --cost
```

### Recipes Command

Validate and apply Chorenzo recipes to automate your workspace:

#### Validate Recipes

```bash
# Validate a recipe by name
npx chorenzo recipes validate code-formatting

# Validate a local recipe folder
npx chorenzo recipes validate ./my-recipe

# Validate an entire recipe library
npx chorenzo recipes validate ~/.chorenzo/recipes/core

# Validate recipes from a git repository
npx chorenzo recipes validate https://github.com/chorenzo-dev/recipes-core.git
```

#### Apply Recipes

Apply automation recipes to your workspace:

```bash
# Apply a recipe by name
npx chorenzo recipes apply code-formatting

# Apply with custom variant
npx chorenzo recipes apply linting --variant strict

# Apply to specific project in monorepo
npx chorenzo recipes apply testing --project frontend

# Apply with progress UI disabled
npx chorenzo recipes apply ci-cd --no-progress

# Show LLM cost information
npx chorenzo recipes apply code-formatting --cost

# Combine flags for detailed output
npx chorenzo recipes apply linting --cost --debug
```

Chorenzo uses atomic, composable automation recipes to handle workspace setup and configuration. See our [recipes documentation](docs/recipes.md) for detailed information about creating and using recipes.

### Help

```bash
# Show all available commands
npx chorenzo --help

# Show help for specific command
npx chorenzo analyze --help
npx chorenzo recipes --help
```

## Requirements

- Node.js 18+
- Git repository (workspace must be in a Git repository)
- Claude Code API access

## License

Apache-2.0
