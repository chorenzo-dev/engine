const { resolve } = require('path');
const { existsSync } = require('fs');

module.exports = (request, options) => {
  if (request.startsWith('./') || request.startsWith('../')) {
    const basedir = options.basedir;

    try {
      return options.defaultResolver(request, options);
    } catch (error) {
      const tsPath = resolve(basedir, request + '.ts');
      if (existsSync(tsPath)) {
        return tsPath;
      }

      const tsxPath = resolve(basedir, request + '.tsx');
      if (existsSync(tsxPath)) {
        return tsxPath;
      }

      throw error;
    }
  }

  return options.defaultResolver(request, options);
};
