Analyze workspace: {workspace_root}

File structure: {files_structure_summary}

## Tool Budget
You have a MAXIMUM of 2 tool rounds. Use them wisely - batch ALL file reads in the first round.

## Efficiency Strategy
1. Look at the file structure and identify ALL config files at once
2. Read ALL of them in a SINGLE batch (Read tool supports multiple calls)
3. Never use Grep or search - just read the files directly

## Penalties

- 🚫 Do NOT read the same file multiple times
- 🚫 Do NOT search for files - the file structure provided is complete
- 🚫 Do NOT make separate tool calls for files in the same directory

## CRITICAL Rules

- has_package_manager = true ONLY if project has dependencies listed in its config file. Empty dependencies = false.
- Check ALL relevant dependency sections (dependencies, devDependencies, peerDependencies, etc.)
- Determine ecosystem based on the package manager type

TASKS:
1. Find and read all configuration files (any package managers) for ACTUAL projects only
2. Determine ecosystems and dependencies from actual config content
3. Detect project type based on dependencies and file structure
4. Return ONLY valid JSON - no explanations, no markdown blocks, no additional text

## CRITICAL: Project vs Test Data Distinction
Only analyze ACTUAL projects, not test data, examples, or fixtures:
- **EXCLUDE**: test-fixtures/, examples/, sample/, templates/, demos/, __tests__/, spec/, test/
- **EXCLUDE**: Any directory that appears to contain example/test code rather than production code
- **INCLUDE**: Only directories that represent actual working projects or applications
- **ROOT PROJECT**: Always analyze the root directory if it has a package manager config file

Look for indicators that distinguish real projects from test data:
- Real projects: Have meaningful dependencies, proper structure, production-ready code
- Test data: Minimal configs, example code, fixture data, sample applications

IMPORTANT: Do NOT use ```json``` markdown blocks. Return raw JSON only.

## Project Type Detection Rules:
- **cli_tool**: Command-line applications that users interact with via terminal. Examples: commander (JS), click (Python), clap (Rust), cobra (Go)
- **web_app**: Frontend applications served to browsers. Examples: react/next (JS), django (Python), rails (Ruby), laravel (PHP)
- **api_server**: HTTP services providing REST/GraphQL APIs. Examples: express (JS), fastapi (Python), gin (Go), spring-boot (Java)
- **backend_service**: Background processors for queues, cron jobs, data processing. Examples: bull (JS), celery (Python), sidekiq (Ruby)
- **library**: Reusable code packages published to registries. Examples: npm packages, pip packages, cargo crates, maven artifacts
- **script**: Simple automation or utility scripts. Examples: build scripts, deployment scripts, data migration scripts
- **infrastructure**: Infrastructure-as-code and deployment configurations. Examples: terraform, kubernetes manifests, docker-compose
- **desktop_app**: Native desktop applications. Examples: electron (JS), tkinter (Python), javafx (Java), wpf (C#)
- **mobile_app**: Mobile applications for phones/tablets. Examples: react-native, flutter, native iOS/Android projects
- **unknown**: Cannot determine project type from available information

## Framework Detection:
For each project, identify the PRIMARY framework that defines the project's architecture and runtime environment. Consider project type context and dependency relationships:

**General Principle:**
Look for the main architectural framework that provides the application structure, routing, and runtime environment. Examples across ecosystems:
- **Web Apps**: nextjs (JS), django (Python), rails (Ruby), laravel (PHP), spring-boot (Java)
- **API Servers**: express (JS), fastapi (Python), gin (Go), rails (Ruby), aspnet-core (C#)
- **CLI Tools**: commander (JS), click (Python), clap (Rust), cobra (Go)

**Context-Aware Detection:**
When multiple frameworks could apply, prioritize the one that defines the project's primary architecture:
- UI libraries (react, vue, angular) are NEVER the main framework - they are rendering libraries
- Build tools, bundlers, and utilities are NOT frameworks
- Look for frameworks that provide application structure, not just UI components
- For vanilla apps without architectural frameworks, set to null

**Common Mistakes to Avoid:**
- Don't list UI/component libraries as frameworks (react, vue, angular, etc.)
- Don't list utility libraries, build tools, or testing frameworks
- Don't list databases, ORMs, or data access layers
- Focus on what provides the application's core architecture and runtime

Set framework to null if no clear architectural framework is identified.

## Docker Detection:
For each project, check if a Dockerfile exists. Set dockerized to true if present, false otherwise.

## CI/CD Detection:
For each project, detect which CI/CD system is being used. Set to "none" if no CI/CD configuration found.

CRITICAL: Your response must be ONLY this JSON structure with no other text. Do NOT wrap in markdown code blocks or add any explanations:
{
"is_monorepo": boolean,
"has_workspace_package_manager": boolean,
"workspace_ecosystem": "javascript" | "python" | "rust" | "go" | "ruby" | "java" | "mixed" | null,
"workspace_dependencies": string[],
"projects": [
{
"path": string,
"language": string,
"type": "cli_tool" | "web_app" | "api_server" | "backend_service" | "library" | "script" | "infrastructure" | "desktop_app" | "mobile_app" | "unknown",
"framework": string | null,
"dockerized": boolean,
"ci_cd": "github_actions" | "gitlab_ci" | "circleci" | "jenkins" | "travis_ci" | "azure_devops" | "bitbucket_pipelines" | "teamcity" | "bamboo" | "codeship" | "drone" | "buildkite" | "semaphore" | "appveyor" | "none",
"dependencies": string[],
"has_package_manager": boolean,
"ecosystem": string | null
}
]
}