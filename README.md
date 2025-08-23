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

# Skip automatic workspace analysis
npx chorenzo init --no-analyze
# Or use alias
npx chorenzo init -A

# Skip interactive confirmation
npx chorenzo init -y
# Or combine with other options
npx chorenzo init --reset -y

# Show detailed debug output
npx chorenzo init --debug

# Show LLM cost information
npx chorenzo init --cost
```

### Analyze Command

Analyze your workspace and get detailed insights about project structure, dependencies, and ecosystems:

```bash
# Analyze workspace
npx chorenzo analyze

# Show detailed debug output
npx chorenzo analyze --debug

# Show LLM cost information
npx chorenzo analyze --cost
```

### Recipes Command

Validate, apply, and generate Chorenzo recipes to automate your workspace:

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

# Show detailed debug output
npx chorenzo recipes validate code-formatting --debug
```

#### List Available Recipes

Browse all available recipes organized by category:

```bash
# Browse all recipes by category (interactive)
npx chorenzo recipes list

# Show detailed debug output
npx chorenzo recipes list --debug
```

#### Show Recipe Details

Show detailed information about a specific recipe:

```bash
# Show details for a recipe by name
npx chorenzo recipes show code-formatting

# Show details for any available recipe
npx chorenzo recipes show testing-setup

# Show detailed debug output
npx chorenzo recipes show ci-cd --debug
```

#### Apply Recipes

Apply automation recipes to your workspace:

```bash
# Apply a recipe by name
npx chorenzo recipes apply code-formatting

# Apply a local recipe folder
npx chorenzo recipes apply ./my-recipe

# Apply with custom variant
npx chorenzo recipes apply linting --variant strict

# Apply to specific project in monorepo
npx chorenzo recipes apply testing --project frontend

# Skip interactive confirmations
npx chorenzo recipes apply eslint-config -y

# Bypass validation requirements (advanced users only)
npx chorenzo recipes apply linting --force

# Show detailed debug output
npx chorenzo recipes apply linting --debug

# Show LLM cost information
npx chorenzo recipes apply code-formatting --cost

# Combine flags for detailed output
npx chorenzo recipes apply linting --cost --debug -y
```

#### Generate Recipes

Create new automation recipes for your workspace:

```bash
# Interactive recipe generation (prompts for all details)
npx chorenzo recipes generate

# Generate with recipe name
npx chorenzo recipes generate my-recipe

# Generate with all parameters specified
npx chorenzo recipes generate eslint-setup \
  --category tools \
  --summary "Set up ESLint and Prettier with TypeScript support for consistent code formatting"

# Generate to custom location
npx chorenzo recipes generate testing \
  --location ~/my-recipes \
  --category development \
  --summary "Configure Jest testing framework with coverage reporting and TypeScript integration"

# Show detailed debug output
npx chorenzo recipes generate my-recipe --debug

# Show LLM cost for AI-generated recipes
npx chorenzo recipes generate my-recipe --cost

# Generate ecosystem-agnostic recipe
npx chorenzo recipes generate docker-setup --ecosystem-agnostic \
  --category infrastructure \
  --summary "Add Docker support for any project type"

# Generate ecosystem-specific recipe
npx chorenzo recipes generate typescript-setup --ecosystem-specific \
  --category tools \
  --summary "Set up TypeScript configuration for JavaScript projects"

# Generate AI-powered recipe content
npx chorenzo recipes generate auth-system --magic-generate \
  --category security \
  --summary "Implement authentication system"

# Generate with additional AI instructions
npx chorenzo recipes generate api-endpoints --magic-generate \
  --additional-instructions "Use FastAPI with async support" \
  --category api \
  --summary "Create REST API endpoints"
```

**Options:**

- `--debug`: Show detailed debug output with all progress messages
- `--cost`: Show LLM cost information (for AI-generated recipes)
- `--location <path>`: Custom save location (supports ~ for home directory)
- `--category <category>`: Recipe category (required for non-interactive mode)
- `--summary <summary>`: Recipe summary (required for non-interactive mode)
- `--ecosystem-agnostic`: Create recipe that works across multiple ecosystems (generates single fix.md file)
- `--ecosystem-specific`: Create recipe with separate fixes for each ecosystem (generates fix.md base file plus variants/ directory with ecosystem-specific files)
- `--magic-generate`: Generate recipe content using AI (uses Claude)
- `--additional-instructions <instructions>`: Additional instructions for AI generation (requires --magic-generate)

**Interactive Mode:**
When run without required parameters, the generate command will prompt you interactively for:

- Recipe name (letters, numbers, and dashes only)
- Magic generation choice (AI-generated vs template-based)
- Save location (current workspace, home directory, or custom path)
- Category selection (with autocomplete from existing categories)
- Recipe summary (descriptive one-sentence explanation)

**Non-interactive Mode:**
For automation and scripting, provide all required parameters:

- `--category`: Recipe category (required)
- `--summary`: Descriptive summary (required)
- `--location`: Custom save location (optional, defaults to current directory)

Chorenzo uses atomic, composable automation recipes to handle workspace setup and configuration. Recipes operate at different levels with intelligent application logic:

- **Workspace-only**: Apply exclusively at workspace level (e.g., git hooks, global config)
- **Project-only**: Apply exclusively to individual projects (e.g., framework setup, project config)
- **Workspace-preferred**: Apply at workspace level when possible, fall back to projects for mixed ecosystems

Recipes can conditionally apply based on project and workspace characteristics from your analysis.json:

```yaml
# Recipe that only applies to Python projects
requires:
  - key: project.ecosystem
    equals: python

# Recipe that requires a monorepo workspace
requires:
  - key: workspace.is_monorepo
    equals: true
```

See our [recipes documentation](docs/recipes.md) for detailed information about creating and using recipes, including the full list of available project characteristics.

### Common Flags

Most commands support these common flags:

- `--debug`: Show detailed debug output with all progress messages
- `--cost`: Show LLM cost information (for commands that use AI)

### Help

```bash
# Show all available commands
npx chorenzo --help

# Show help for specific command
npx chorenzo init --help
npx chorenzo analyze --help
npx chorenzo recipes --help

# Show help for recipe subcommands
npx chorenzo recipes validate --help
npx chorenzo recipes show --help
npx chorenzo recipes apply --help
npx chorenzo recipes generate --help
```

## Requirements

- Node.js 18+
- Git repository (workspace must be in a Git repository)
- Claude Code API access

## License

Apache-2.0
