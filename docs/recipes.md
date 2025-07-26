# Chorenzo Recipes

Chorenzo uses atomic, composable automation recipes to handle workspace setup and configuration.

## Recipe Levels

Recipes operate at two distinct levels:

### Workspace-Level Recipes

Apply to the entire workspace and execute once per workspace:

- **Use case**: Global configuration, workspace-wide tools, root-level dependencies
- **Examples**: Git hooks, workspace package manager setup, global linting rules
- **State storage**: Values stored under `workspace` field in state.json
- **Ecosystem matching**: Must support the workspace's primary ecosystem

### Project-Level Recipes

Apply to individual projects and execute once per applicable project:

- **Use case**: Project-specific configuration, per-project dependencies, build setup
- **Examples**: Framework setup, project-specific linting, test configuration
- **State storage**: Values stored under `projects.{project_path}` in state.json
- **Ecosystem matching**: Must support each project's individual ecosystem

## Recipe Structure

Each recipe is a self-contained folder with a specific structure:

```
recipe_id/
├── metadata.yaml      # Recipe configuration and dependencies
├── prompt.md          # Consolidated LLM instructions
└── fixes/
    ├── variant_a.md   # Fix instructions for variant A
    └── variant_b.md   # Fix instructions for variant B
```

## File Contents

### metadata.yaml

Minimal manifest declaring the recipe's identity, supported ecosystems, and dependencies:

```yaml
id: recipe_id # Must match folder name (kebab-case)
category: category_id # Grouping for UI display
summary: One-sentence description of what this recipe does.
level: project # Required: 'workspace' or 'project'

ecosystems: # Languages/runtimes this recipe supports
  - id: javascript
    default_variant: prettier
    variants:
      - id: prettier
        fix_prompt: fixes/javascript_prettier.md

provides: # Facts this recipe outputs
  - recipe_id.exists
  - recipe_id.configured
  - recipe_id.variant

requires: [] # Dependencies (array of {key: fact, equals: value})
```

### prompt.md

Single unified prompt file with three required sections:

```markdown
## Goal

One-sentence goal describing what this recipe accomplishes.

## Investigation

1. **Step one**
   - Specific, actionable instruction
   - Tool-agnostic discovery commands
2. **Step two**
   - Focus on detection, not analysis
   - No vague instructions like "examine files"

## Expected Output

- <recipe_id>.key1: Clear description of what this boolean/string represents
- <recipe_id>.key2: Another fact this recipe will emit
```

**Important**: Investigation and fix prompts are consumed by machines, not humans. Use definitive, declarative language (e.g., "Install the package" not "You should install the package").

### fixes/variant.md

Variant-specific implementation instructions:

```markdown
# Setting up [Tool Name]

## Installation

Concrete commands to install the tool.

## Configuration

Example configuration with sensible defaults.

## Verification

How to verify the tool is working correctly.
```

## Recipe Design Principles

1. **Single Responsibility**: Each recipe does one thing well
2. **Language Agnostic**: Investigation prompts detect ANY relevant tools, not specific ones
3. **Actionable Instructions**: Every step must be concrete and executable
4. **No Overlapping Concerns**: Integration, CI/CD, and editor config are separate recipes
5. **Clear Facts**: Expected outputs are well-defined contracts for downstream recipes
6. **Machine-First Language**: Use declarative, definitive instructions without human-oriented phrasing
7. **Minimal Configuration**: Only specify non-default settings when necessary
8. **Respect Existing Ignore Files**: Most tools respect .gitignore; only add ignore patterns for files not already gitignored
9. **Level Awareness**: Choose the appropriate level (workspace vs project) based on the recipe's scope

## State Management

Recipe state is stored in `.chorenzo/state.json` with a hierarchical structure:

```json
{
  "workspace": {
    "git-hooks.configured": true,
    "workspace-eslint.enabled": true
  },
  "projects": {
    "frontend": {
      "react-setup.configured": true,
      "typescript.enabled": true
    },
    "backend": {
      "node-api.configured": true,
      "express.setup": "complete"
    }
  }
}
```

### State Structure

- **Workspace state**: Shared across the entire workspace under the `workspace` key
- **Project state**: Per-project values under `projects.{relative_path}`
- **Key naming**: Use recipe ID as prefix (e.g., `recipe-id.property`)
- **Value types**: Primitives (boolean, string, number) for reliable dependency checking

## Example Recipe

See `code_quality/code_formatting/` for a complete example implementing code formatter detection and setup.

## Contributing

1. Create a folder matching your recipe ID (kebab-case)
2. Add `metadata.yaml` with at least: id, summary, level, ecosystems, provides
3. Write `prompt.md` with Goal, Investigation, and Expected Output sections
4. Add variant-specific fix prompts under `fixes/`
5. Ensure all paths in metadata.yaml match actual file locations
6. Choose the appropriate level: `workspace` for global tools, `project` for per-project setup

## Recipe Validation

Use the `chorenzo recipes validate` command to validate recipes. The command automatically detects the input type and validates accordingly:

```bash
# Validate by recipe name (searches ~/.chorenzo/recipes)
chorenzo recipes validate code-formatting

# Validate a local recipe folder
chorenzo recipes validate ./my-recipe
chorenzo recipes validate ~/my-recipes/custom-recipe

# Validate an entire recipe library
chorenzo recipes validate ~/.chorenzo/recipes/core
chorenzo recipes validate ./my-recipes-library

# Validate recipes from a git repository
chorenzo recipes validate https://github.com/chorenzo-dev/recipes-core.git
```

### Validation Features

- **Smart Detection**: Automatically detects recipe names, local paths, libraries, and git URLs
- **Recipe Discovery**: Finds recipes by name across all libraries in ~/.chorenzo/recipes
- **Conflict Resolution**: Shows clear errors when multiple recipes have the same name
- **Comprehensive Validation**: Validates metadata structure, required files, and recipe integrity
- **Detailed Reporting**: Shows validation results with errors, warnings, and summary statistics
