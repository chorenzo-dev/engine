# Contributing to Chorenzo Engine

Thank you for your interest in contributing to Chorenzo Engine! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 20.16.0+ (see `.nvmrc` for exact version)
- npm (comes with Node.js)
- Git

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/engine.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Start developing!

### Development Commands

```bash
# Build the project
npm run build

# Run tests
npm test
npm run test:coverage

# Code quality
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run typecheck

# Development
npm run dev
```

## Commit Message Format

This project follows [Conventional Commits](https://conventionalcommits.org/) specification for commit messages and PR titles.

### Format

`<type>: <description>`

### Allowed Types

- `feat`: new features
- `fix`: bug fixes
- `docs`: documentation changes
- `chore`: maintenance tasks (dependencies, build config, etc.)
- `ci`: CI/CD pipeline changes
- `refactor`: code refactoring without functionality changes

### Examples

- `feat: add recipe validation command`
- `fix: resolve memory leak in state manager`
- `docs: update installation instructions`
- `chore: update dependencies to latest versions`

### Validation

- **PR titles** are automatically validated and must follow this format
- **Feature branch commits** are flexible and not enforced

## Testing Guidelines

### Testing Philosophy

- **Integration tests only**: All tests start from command level (`src/commands/**/*.test.ts`)
- **No unit tests**: We don't test internal functions in isolation
- **Mock external dependencies**: Only mock filesystem, APIs, and external tools
- **End-to-end functionality**: Tests should exercise complete user workflows

### Writing Tests

- Place tests alongside command files: `src/commands/[command]/[command].test.ts`
- Use descriptive test names that explain the scenario
- Follow the existing test patterns and utilities
- Ensure tests are deterministic and don't depend on external state

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (development)
npm run test:watch
```

## Code Style

### Formatting and Linting

- Code is automatically formatted with Prettier
- ESLint enforces code quality rules
- Pre-commit hooks ensure consistency
- TypeScript provides type safety

### Guidelines

- **No code comments** unless specifically requested
- **Import organization**: All imports at the top, organized by type
- **TypeScript**: Use strict typing, avoid `any`
- **Error handling**: Use proper error boundaries and meaningful messages

## Pull Request Process

### Before Submitting

1. Ensure all tests pass: `npm test`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Run formatting: `npm run format:check`
5. Build successfully: `npm run build`

### PR Requirements

- **Title**: Must follow conventional commit format (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`)
- **Description**: Clear explanation of changes and motivation
- **Tests**: Include tests for new functionality
- **Documentation**: Update docs if needed
- **Branch**: Feature branches off `main`

### Review Process

- All PRs require review before merging
- CI/CD pipelines must pass (build, test, lint)
- PR title validation must pass
- Squash and merge is the only merge strategy

## Project Structure

```
src/
├── commands/          # CLI command implementations
│   ├── [command]/
│   │   ├── [command].ts
│   │   └── [command].test.ts
├── components/        # React UI components
├── containers/        # UI container components
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── main.ts           # CLI entry point
```

## Architecture Principles

### Command Pattern

- Each CLI command is a separate module
- Commands handle their own argument parsing
- UI logic is separated into containers and components

### Error Handling

- Use structured error types
- Provide helpful error messages to users
- Log errors appropriately for debugging

## Getting Help

- **Issues**: Open an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check README.md and inline docs

## License

By contributing to Chorenzo Engine, you agree that your contributions will be licensed under the Apache-2.0 License.
