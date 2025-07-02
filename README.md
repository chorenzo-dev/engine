# Chorenzo Engine

Open-source CLI engine that automates your engineering workflow with AI-powered workspace analysis.

## Usage

### Analyze Command

Analyze your workspace and get detailed insights about project structure, dependencies, and ecosystems:

```bash
# With progress UI (default)
npx @chorenzo/engine analyze

# Simple text output without progress UI
npx @chorenzo/engine analyze --no-progress
```

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
