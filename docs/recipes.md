# Chorenzo Recipes

Chorenzo uses atomic, composable automation recipes to handle workspace setup and configuration.

## Recipe Levels

Recipes operate at different levels with hierarchical application logic:

### Workspace-Only Recipes (`workspace-only`)

Apply exclusively to the workspace root and execute once per workspace:

- **Use case**: Global configuration, workspace-wide tools, root-level dependencies
- **Examples**: Git hooks, workspace package manager setup, global linting rules
- **State storage**: Values stored under `workspace` field in state.json
- **Ecosystem matching**: Must support the workspace's primary ecosystem
- **Behavior**: Never applies to individual projects, even in mixed-ecosystem scenarios

### Project-Only Recipes (`project-only`)

Apply exclusively to individual projects and execute once per applicable project:

- **Use case**: Project-specific configuration, per-project dependencies, build setup
- **Examples**: Framework setup, project-specific linting, test configuration
- **State storage**: Values stored under `projects.{project_path}` in state.json
- **Ecosystem matching**: Must support each project's individual ecosystem
- **Behavior**: Never applies at workspace level, always targets individual projects

### Workspace-Preferred Recipes (`workspace-preferred`)

Intelligently apply at workspace or project level based on ecosystem and state compatibility:

- **Primary behavior**: Apply at workspace level when the recipe supports the workspace ecosystem
- **Fallback behavior**: Apply to individual projects when:
  - Project ecosystem differs from workspace ecosystem
  - Recipe doesn't support workspace ecosystem but supports project ecosystems
  - Project-specific state requirements differ from workspace state
- **Use case**: Tools that work best globally but need project-specific handling in mixed environments
- **Examples**: Code formatting in JavaScript monorepos with Python projects, linting rules that vary by project
- **State storage**: Uses both workspace and project state as appropriate
- **Ecosystem matching**: Supports both workspace and project ecosystems dynamically

## Recipe Structure

All recipes use a unified structure with a mandatory base `fix.md` file and optional variant-specific additions:

```
recipe_id/
├── metadata.yaml      # Recipe configuration and dependencies
├── prompt.md          # Consolidated LLM instructions
├── fix.md             # REQUIRED: Base instructions for all ecosystems
└── variants/          # OPTIONAL: Variant-specific additions
    ├── eslint.md               # Simple variant name
    ├── github-actions.md       # Simple variant name
    ├── javascript_eslint.md    # Ecosystem-prefixed variant
    └── python_ruff.md          # Ecosystem-prefixed variant
```

**All recipes** must have a `fix.md` file containing base instructions. **Ecosystem-agnostic recipes** use `ecosystems: []` and typically only need the base `fix.md` file. **Ecosystem-specific recipes** can add variant files in the `variants/` directory for specialized implementations.

## File Contents

### metadata.yaml

Minimal manifest declaring the recipe's identity, supported ecosystems, and dependencies:

```yaml
id: recipe_id # Must match folder name (kebab-case)
category: category_id # Grouping for UI display
summary: One-sentence description of what this recipe does.
level: workspace-preferred # Required: 'workspace-only', 'project-only', or 'workspace-preferred'

ecosystems: # Languages/runtimes this recipe supports
  - id: javascript
    default_variant: prettier
    variants:
      - id: prettier
        fix_prompt: variants/javascript_prettier.md

provides: # Facts this recipe outputs
  - recipe_id.exists
  - recipe_id.configured
  - recipe_id.variant

requires: [] # Dependencies (array of {key: fact, equals: value}) or project characteristics
```

> **Note**: For ecosystem-agnostic recipes, use `ecosystems: []` (empty array) instead of listing specific ecosystems. These recipes work across all programming languages and use a single `fix.md` file.

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

### fix.md

Base implementation instructions that work for all ecosystems:

```markdown
# Setting up [Recipe Name]

## Installation

Common installation steps that work across ecosystems.

## Configuration

Base configuration that applies universally.

## Verification

How to verify the setup is working correctly.
```

### variants/[variant].md

Optional variant-specific additions for specific tools or ecosystems:

```markdown
# [Variant Name] specific additions

## Additional Installation

Additional steps specific to this variant.

## Variant Configuration

Configuration specific to this tool or ecosystem.

## Variant Verification

Additional verification steps for this variant.
```

**Content Concatenation**: When applying a recipe with a variant, the system automatically concatenates `fix.md` content with the variant content: `baseContent + '\n\n' + variantContent`. This allows for shared base instructions with variant-specific additions.

## Recipe Design Principles

1. **Single Responsibility**: Each recipe does one thing well
2. **Language Agnostic**: Investigation prompts detect ANY relevant tools, not specific ones
3. **Actionable Instructions**: Every step must be concrete and executable
4. **No Overlapping Concerns**: Integration, CI/CD, and editor config are separate recipes
5. **Clear Facts**: Expected outputs are well-defined contracts for downstream recipes
6. **Machine-First Language**: Use declarative, definitive instructions without human-oriented phrasing
7. **Minimal Configuration**: Only specify non-default settings when necessary
8. **Respect Existing Ignore Files**: Most tools respect .gitignore; only add ignore patterns for files not already gitignored
9. **Level Awareness**: Choose the appropriate level based on the recipe's scope:
   - `workspace-only` for tools that must be global (git hooks, workspace config)
   - `project-only` for tools that must be per-project (framework setup, project build)
   - `workspace-preferred` for tools that work best globally but handle mixed ecosystems

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
4. Add fix implementation:
   - **Most recipes**: Add variant-specific fix prompts under `variants/` directory
   - **Universal tools only**: Use `ecosystems: []` and create a single `fix.md` file
5. Ensure all paths in metadata.yaml match actual file locations
6. Choose the appropriate level:
   - `workspace-only` for global tools that must never apply per-project
   - `project-only` for per-project setup that must never apply globally
   - `workspace-preferred` for tools that work best globally but handle mixed ecosystems

> **Ecosystem-agnostic recipes** should only be used for truly universal tools like Git hooks, editor configs, or documentation templates that work identically across all programming languages.

## Project Characteristics

Recipes can use project and workspace characteristics from analysis.json in their `requires` field to conditionally apply based on project properties:

### Workspace Characteristics

Access workspace-level properties with the `workspace.` prefix:

- `workspace.is_monorepo`: Whether the workspace contains multiple projects (boolean)
- `workspace.has_workspace_package_manager`: Whether a workspace-level package manager is detected (boolean)
- `workspace.ecosystem`: Primary ecosystem of the workspace (string)
- `workspace.cicd`: CI/CD platform detected in the workspace (string)

### Project Characteristics

Access project-level properties with the `project.` prefix:

- `project.language`: Primary programming language (string)
- `project.type`: Project type (e.g., "library", "application") (string)
- `project.framework`: Framework used by the project (string)
- `project.ecosystem`: Project's ecosystem (string)
- `project.has_package_manager`: Whether the project has a package manager (boolean)
- `project.dockerized`: Whether the project is containerized (boolean)

### Usage Examples

```yaml
# Recipe that only applies to Python projects
requires:
  - key: project.ecosystem
    equals: python

# Recipe that requires a monorepo workspace
requires:
  - key: workspace.is_monorepo
    equals: true

# Recipe that applies to React projects in JavaScript ecosystem
requires:
  - key: project.ecosystem
    equals: javascript
  - key: project.framework
    equals: react
```

### Important Notes

- Project characteristics are **read-only** and cannot be provided by recipes
- Reserved keywords (`workspace.*`, `project.*`) cannot be used in the `provides` field
- Workspace characteristics are available at both workspace and project levels
- Project characteristics are only available when applying to specific projects

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
