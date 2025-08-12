## Testing Principles

- Only write integration tests that exercise end-to-end functionality, starting from commands under @/commands
- Only mock external dependencies and side effects (filesystem, APIs, external tools)
- Do not write unit tests for individual internal functions; test internal logic only through integration tests that begin with @/commands

## Code Writing Guidelines

- Never add code comments unless specifically asked

- never include the ticket ID in the PR description
- use an appropriate semantic versioning prefix in PR titles, never use them in commits
