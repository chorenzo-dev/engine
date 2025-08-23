## Goal

Update README.md with accurate CLI documentation by scanning src/main.ts for all commands, ensuring complete coverage while preserving existing structure.

## Investigation

1. **Scan src/main.ts for all commands**
   - Extract every command definition from the Commander.js program
   - Include all subcommands (e.g., analysis validate, recipes apply, etc.)
   - Document ALL options, flags, and arguments for each command - ensure no parameters are missing
   - Note required vs optional parameters and default values
   - Pay special attention to parameter mismatches between source and documentation

2. **Validate completeness against existing README**
   - Identify missing commands not documented in README
   - Find missing or outdated command options/flags
   - Verify every single option in src/main.ts is properly documented
   - CRITICAL: Check that option descriptions match exactly between source code and README
   - Preserve existing README structure and formatting
   - Use `npx chorenzo` format consistently

## Expected Output

No output
