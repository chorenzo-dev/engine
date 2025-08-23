# Update README with CLI Documentation

## Process

1. **Extract all commands from src/main.ts**
   - Read Commander.js program definitions line by line
   - For each `.option()` call, document the exact flag and description text
   - Cross-reference every option in src/main.ts with existing README documentation
   - CRITICAL: Ensure option descriptions in README exactly match the help text from src/main.ts
   - Flag any missing parameters, mismatched descriptions, or outdated text
   - Include help text and examples from source code
   - Skip hidden commands (marked with `{ hidden: true }`)

2. **Update README.md**
   - Preserve existing structure and formatting
   - Update command documentation sections with current information
   - Ensure all examples use `npx chorenzo` format
   - Add any missing commands not currently documented

3. **Key rules**
   - DO NOT add installation sections
   - DO NOT duplicate existing content
   - Keep all non-CLI content intact
   - Use consistent markdown formatting

## Commands to document

Scan src/main.ts and extract command definitions including:

- Base commands and subcommands (skip hidden commands marked with `{ hidden: true }`)
- Every single `.option()` call - verify none are missing from README
- All options, flags, and arguments for each command
- Required vs optional parameters
- Help text and examples from the source code
- CRITICAL: Verify each command in README has all options that exist in src/main.ts
- CRITICAL: Use the exact same wording as the help menu descriptions in src/main.ts
