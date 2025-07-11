const { resolve, join } = require('path');
const { existsSync } = require('fs');

module.exports = (request, options) => {
  // Handle relative imports that should resolve to TypeScript files
  if (request.startsWith('./') || request.startsWith('../')) {
    const basedir = options.basedir;
    
    // Try resolving as-is first
    try {
      return options.defaultResolver(request, options);
    } catch (error) {
      // If that fails, try adding .ts extension
      const tsPath = resolve(basedir, request + '.ts');
      if (existsSync(tsPath)) {
        return tsPath;
      }
      
      // Try adding .tsx extension
      const tsxPath = resolve(basedir, request + '.tsx');
      if (existsSync(tsxPath)) {
        return tsxPath;
      }
      
      // If still not found, re-throw the original error
      throw error;
    }
  }
  
  // For all other cases, use the default resolver
  return options.defaultResolver(request, options);
};