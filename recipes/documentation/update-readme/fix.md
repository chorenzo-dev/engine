# Updating README with CLI Documentation

## Extract Command Documentation

Parse the main CLI file to extract all commands, options, and usage patterns:

1. Read the primary CLI entry point file
2. Extract command definitions including:
   - Command names and aliases
   - All options and flags with descriptions
   - Required vs optional parameters
   - Default values where applicable
   - Usage examples from help text

## Generate Documentation Sections

Create comprehensive CLI documentation sections:

### Command Overview

- List all available commands with brief descriptions
- Include command hierarchy and relationships
- Show global options that apply to all commands

### Individual Command Documentation

For each command, document:

- Full command syntax
- All available options and flags
- Parameter descriptions and constraints
- Usage examples showing common patterns
- Exit codes and error handling

### Help System Documentation

- Document how to access help for each command
- Include examples of help command output
- Show how to get detailed help for specific commands

## Update README Structure

Maintain existing README structure while updating CLI sections:

1. **Preserve existing content**: Keep all non-CLI documentation intact
2. **Update CLI sections**: Replace outdated command documentation with current information
3. **Maintain formatting**: Use consistent markdown formatting throughout
4. **Add missing sections**: Create new sections for undocumented commands

## Documentation Format

Use clear, consistent formatting:

````markdown
## Commands

### `command-name [options] [arguments]`

Brief description of what this command does.

**Options:**

- `--option-name`: Description of the option
- `--flag`: Description of the flag (no value)
- `-s, --short`: Short and long form options

**Examples:**

```bash
command-name --option value
command-name --flag argument
```
````

**Note:** Add any important usage notes or warnings

```

## Verification

After updating the README:

1. **Accuracy check**: Verify all documented commands match actual CLI behavior
2. **Completeness check**: Ensure all available commands and options are documented
3. **Format check**: Confirm markdown formatting is correct and consistent
4. **Example validation**: Test that all provided examples work correctly

## Maintenance Notes

Document the update process for future maintenance:

- Note the source file location for CLI definitions
- Include instructions for regenerating documentation
- Add comments about automated vs manual sections
- Provide guidelines for keeping documentation synchronized with code changes
```
