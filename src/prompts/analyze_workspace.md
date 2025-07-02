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
3. Return ONLY valid JSON - no explanations, no markdown blocks, no additional text

CRITICAL: Your response must be ONLY this JSON structure with no other text:
{
"is_monorepo": boolean,
"has_workspace_package_manager": boolean,
"workspace_ecosystem": "javascript" | "python" | "rust" | "go" | "ruby" | "java" | "mixed" | null,
"workspace_dependencies": string[],
"projects": [
{
"path": string,
"language": string,
"dependencies": string[],
"has_package_manager": boolean,
"ecosystem": string | null
}
]
}