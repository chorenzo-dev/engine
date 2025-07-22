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

State Management:

After successfully completing the recipe application, you MUST update the state.json file located at {{ workspace_root }}/.chorenzo/state.json to track what this recipe provides.

The state.json file tracks the current state of applied recipes. You must:

1. Read the current state.json file (create it if it doesn't exist with {})
2. Add/update the following keys based on your successful completion of the recipe:
   {{ recipe_provides }}
   
   Set appropriate values for each key based on what you actually accomplished during the recipe execution.
3. Write the updated state back to state.json with keys in alphabetical order

After completing the recipe application, respond with:

1. A summary of what was accomplished
2. Confirmation that state.json was updated
3. Any warnings or issues encountered
