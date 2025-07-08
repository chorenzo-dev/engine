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
1. Find and read all configuration files (any package managers)
2. Determine ecosystems and dependencies from actual config content
3. Detect project type based on dependencies and file structure
4. Return ONLY valid JSON - no explanations, no markdown blocks, no additional text

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
For each project, identify the main framework used (if any). Set to null if no specific framework is used.
Examples: commander (CLI), react (web), express (API), django (web), flutter (mobile), electron (desktop)

## Docker Detection:
For each project, check if a Dockerfile exists. Set dockerized to true if present, false otherwise.

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
"dependencies": string[],
"has_package_manager": boolean,
"ecosystem": string | null
}
]
}