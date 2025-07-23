import type { jest as jestType } from '@jest/globals';

declare global {
  namespace jest {
    function unstable_mockModule<T = unknown>(
      moduleName: string,
      factory?: () => T | Promise<T>,
      options?: MockOptions
    ): typeof jestType;
  }
}

interface MockOptions {
  virtual?: boolean;
}

export {};
