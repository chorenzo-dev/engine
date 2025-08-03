## Goal

Automatically update README.md with complete and accurate documentation of all CLI commands and their parameters.

## Investigation

1. **Locate main CLI entry point**
   - Find the primary CLI definition file (commonly main.js, main.ts, cli.js, or index.js in src/ or root)
   - Search for Commander.js usage patterns or similar CLI framework imports
   - Identify the file containing command definitions and argument parsing

2. **Extract CLI command structure**
   - Parse all available commands from the main CLI file
   - Identify command hierarchy (base commands, subcommands)
   - Document all available options, flags, and arguments for each command
   - Note default values, required parameters, and optional parameters

3. **Analyze existing README structure**
   - Check if README.md exists in the project root
   - Identify existing CLI documentation sections
   - Locate command examples and help text sections
   - Determine the current documentation format and style

4. **Identify CLI help system**
   - Check if the CLI has built-in help commands
   - Test help output format and structure
   - Verify command usage patterns and examples

## Expected Output

- update-readme.readme-exists: Whether README.md file exists in the project root
- update-readme.cli-documented: Whether CLI commands are currently documented in README
- update-readme.commands-extracted: Whether CLI command definitions were successfully parsed from source code
