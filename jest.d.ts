import { jest } from '@jest/globals';

declare global {
  namespace jest {
    function unstable_mockModule<T = unknown>(
      moduleName: string,
      factory?: () => T | Promise<T>,
      options?: MockOptions
    ): typeof jest;
  }
}

interface MockOptions {
  virtual?: boolean;
}

export {};