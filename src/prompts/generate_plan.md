Generate a detailed plan for applying the recipe "{{ recipe_id }}" to the project at {{ project_path }}.

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

Based on the above recipe instructions, create a detailed execution plan.

IMPORTANT: Structure your response as a YAML document with the following format:

```yaml
title: "chorenzo plan: {{ recipe_id }} · {{ recipe_variant }}"
steps:
  - type: "step_type"
    description: "What this step accomplishes"
    commands:
      - "command to execute"
    files:
      - path: "file/path"
        content: |
          file content here
outputs:
  {{ recipe_provides }}
```

Step types can include: install, configure, create, update, verify, etc.
The outputs section should map each provided key to its expected value (usually true for boolean flags).
Make sure all steps are specific to the project's ecosystem and existing setup.