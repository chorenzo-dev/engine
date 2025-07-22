import { jest } from '@jest/globals';

export function mockEnvironment(
  workspacePath: string = '/workspace/test-project',
  homeDir: string = '/home/testuser'
) {
  const originalCwd = process.cwd;
  const originalEnv = process.env.NODE_ENV;

  Object.defineProperty(process, 'cwd', {
    value: jest.fn().mockReturnValue(workspacePath),
    writable: true,
    configurable: true,
  });

  jest.doMock('os', () => ({
    homedir: jest.fn().mockReturnValue(homeDir),
  }));

  process.env.NODE_ENV = 'test';

  return () => {
    Object.defineProperty(process, 'cwd', {
      value: originalCwd,
      writable: true,
      configurable: true,
    });
    process.env.NODE_ENV = originalEnv;
    jest.dontMock('os');
  };
}
