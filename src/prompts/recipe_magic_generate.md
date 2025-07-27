Generate a Chorenzo recipe for: {{ recipe_name }}

Summary: {{ summary }}
Category: {{ category }}
Recipe ID: {{ recipe_id }}
Recipe Path: {{ recipe_path }}
{{ additional_instructions }}

Follow these guidelines for creating the recipe:
{{ recipe_guidelines }}

**IMPORTANT ECOSYSTEM REQUIREMENTS:**
- Chorenzo is ecosystem agnostic and supports any programming language
- However, Chorenzo currently only auto-generates fixes for two ecosystems: `javascript` and `python`
- An ecosystem refers to the language runtime environment, NOT specific technologies:
  - ✅ `javascript` ecosystem includes: TypeScript, Node.js, React, Vue, Angular, etc.
  - ✅ `python` ecosystem includes: Django, Flask, FastAPI, etc.
  - ❌ Do NOT create separate ecosystems for TypeScript, React, Node.js - they are all `javascript`
  - ❌ Do NOT create ecosystems for specific frameworks or tools

Create the complete recipe files directly:
1. Create {{ recipe_path }}/metadata.yaml with proper recipe configuration
   - Use ONLY `javascript` or `python` as ecosystem IDs
   - Use appropriate framework names in variants (e.g., react, express, django, fastapi)
2. Create {{ recipe_path }}/prompt.md with detailed investigation steps
3. Create {{ recipe_path }}/fixes/[ecosystem]_[variant].md with implementation instructions
   - Examples: `javascript_default.md`, `python_default.md`, `javascript_react.md`

Use the Write tool to create each file with appropriate content following the recipe design principles. Make sure to include specific, actionable investigation steps and clear fix instructions.