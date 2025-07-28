Generate a Chorenzo recipe for: {{ recipe_name }}

Summary: {{ summary }}
Category: {{ category }}
Recipe ID: {{ recipe_id }}
Recipe Path: {{ recipe_path }}
{{ additional_instructions }}

Follow these guidelines for creating the recipe:
{{ recipe_guidelines }}

**ECOSYSTEM REQUIREMENTS:**

- Use ONLY `javascript` or `python` as ecosystem IDs
- An ecosystem refers to the language runtime environment, NOT specific technologies
- ✅ `javascript` includes: TypeScript, Node.js, React, Vue, Angular, etc.
- ✅ `python` includes: Django, Flask, FastAPI, etc.

**VARIANT CREATION RULES:**

- Only create variants when there are meaningful differences (different tools/approaches)
- Good variants: prettier vs eslint, jest vs vitest, postgresql vs mysql
- Bad variants: single tool with no alternatives
- If only one approach exists, use single 'default' variant
- Variants should represent different implementation strategies, not minor configuration differences

**PROVIDES/REQUIRES GUIDELINES:**

- Create meaningful, specific output names instead of generic ones
- Good: `formatting.prettier-configured`, `linting.eslint-setup`
- Bad: `recipe-name.configured`, `recipe-name.applied`
- Only reference existing recipe outputs in requires field
- Available outputs: {{ available_outputs }}

**INSTRUCTION WRITING RULES:**

- Keep instructions generic and ecosystem-agnostic in prompt.md
- Use specific tools as examples only: "e.g., Prettier for JavaScript, Black for Python"
- Focus on concepts and investigation steps, not tool-specific implementation
- Avoid tool-specific checks unless recipe specifically targets that tool
- Write investigation steps that work across different implementations

**CODE SNIPPET RULES:**

- Avoid basic code examples (imports, simple function calls)
- Only include complex configuration examples when absolutely necessary
- Focus on configuration files and setup commands
- Let developers implement the actual code
- Prefer describing what to configure rather than showing trivial code

**FILE STRUCTURE:**

1. Create {{ recipe_path }}/metadata.yaml with:
   - Meaningful provides/requires lists
   - Only necessary variants
2. Create {{ recipe_path }}/prompt.md with:
   - Generic investigation steps
   - Ecosystem-agnostic guidance
3. Create {{ recipe_path }}/fixes/[ecosystem]\_[variant].md with:
   - Specific implementation for that ecosystem
   - Minimal, essential code examples only

Use the Write tool to create each file following these principles.
