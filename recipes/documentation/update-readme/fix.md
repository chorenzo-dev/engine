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

## Update README Structure - IMPORTANT GUIDELINES

**CRITICAL**: Preserve existing README structure and avoid redundancy:

1. **DO NOT add Installation sections** - The README should focus on usage with `npx chorenzo`
2. **DO NOT create duplicate CLI Reference sections** - Update existing Usage sections instead
3. **DO NOT add redundant command overviews** - Work within existing structure
4. **USE CONSISTENT command format**: Always use `npx chorenzo` (not `chorenzo` or global install)
5. **Preserve existing content**: Keep all non-CLI documentation intact
6. **Update CLI sections**: Replace outdated command documentation with current information from source code
7. **Maintain formatting**: Use consistent markdown formatting throughout
8. **Focus on existing sections**: Update the existing Usage section structure

## Generate Documentation Updates

Update existing command sections with:

### Individual Command Documentation

For each existing command section, update:

- Full command syntax using `npx chorenzo` format
- All available options and flags with accurate descriptions
- Parameter descriptions and constraints
- Usage examples showing common patterns
- Ensure all examples use `npx chorenzo` consistently

### Help System Documentation

- Update existing help command examples
- Ensure all help examples use `npx chorenzo` format
- Show how to get detailed help for specific commands

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
