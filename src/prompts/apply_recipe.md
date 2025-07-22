Apply the recipe "{{ recipe_id }}" to the project at {{ project_path }}.

Recipe Summary: {{ recipe_summary }}
Project Type: {{ project_type }}
Project Language: {{ project_language }}
Project Framework: {{ project_framework }}
Project Ecosystem: {{ project_ecosystem }}
Workspace Root: {{ workspace_root }}
Is Monorepo: {{ is_monorepo }}
Package Manager: {{ package_manager }}
Recipe Variant: {{ recipe_variant }}

{{ fix_content }}

Based on the above recipe instructions, apply the changes directly to the project.

Important:

- Execute all necessary commands using the Bash tool
- Create/modify files as needed using the Write/Edit tools
- Follow best practices for the project's ecosystem and setup
- If any step fails, stop and report the error
- Track all changes made for logging

After completing the recipe application, respond with:

1. A summary of what was accomplished
2. List of key outputs/results achieved (for state tracking)
3. Any warnings or issues encountered

Expected outputs for state tracking: {{ recipe_provides }}
