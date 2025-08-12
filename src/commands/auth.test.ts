import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

const mockSpawn = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

jest.mock('~/utils/logger.utils', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Auth Command Integration Tests', () => {
  let performAuthCheck: typeof import('./auth').performAuthCheck;

  const createMockChild = (
    stdout: string,
    stderr: string,
    exitCode: number,
    error?: Error
  ) => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      stdin: { write: jest.fn(), end: jest.fn() },
      on: jest.fn(),
    };

    (mockChild.stdout.on as jest.Mock).mockImplementation((event, callback) => {
      if (event === 'data' && stdout) {
        setTimeout(
          () => (callback as (data: Buffer) => void)(Buffer.from(stdout)),
          0
        );
      }
    });

    (mockChild.stderr.on as jest.Mock).mockImplementation((event, callback) => {
      if (event === 'data' && stderr) {
        setTimeout(
          () => (callback as (data: Buffer) => void)(Buffer.from(stderr)),
          0
        );
      }
    });

    (mockChild.on as jest.Mock).mockImplementation((event, callback) => {
      if (event === 'exit') {
        setTimeout(
          () =>
            (callback as (code: number, signal: null) => void)(exitCode, null),
          0
        );
      } else if (event === 'error' && error) {
        setTimeout(() => (callback as (error: Error) => void)(error), 0);
      }
    });

    return mockChild;
  };

  beforeAll(async () => {
    const authModule = await import('./auth');
    performAuthCheck = authModule.performAuthCheck;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['AWS_BEARER_TOKEN_BEDROCK'];
    delete process.env['CLAUDE_CODE_USE_BEDROCK'];
    delete process.env['CLAUDE_CODE_USE_VERTEX'];
  });

  describe('Environment Variable Authentication', () => {
    it('should succeed when ANTHROPIC_API_KEY is set', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';

      const result = await performAuthCheck();

      expect(result).toBe(true);
    });

    it('should succeed when ANTHROPIC_AUTH_TOKEN is set', async () => {
      process.env['ANTHROPIC_AUTH_TOKEN'] = 'test-auth-token';

      const result = await performAuthCheck();

      expect(result).toBe(true);
    });

    it('should succeed when AWS_BEARER_TOKEN_BEDROCK is set', async () => {
      process.env['AWS_BEARER_TOKEN_BEDROCK'] = 'test-bedrock-token';

      const result = await performAuthCheck();

      expect(result).toBe(true);
    });

    it('should succeed when CLAUDE_CODE_USE_BEDROCK is enabled', async () => {
      process.env['CLAUDE_CODE_USE_BEDROCK'] = '1';

      const result = await performAuthCheck();

      expect(result).toBe(true);
    });

    it('should succeed when CLAUDE_CODE_USE_VERTEX is enabled', async () => {
      process.env['CLAUDE_CODE_USE_VERTEX'] = '1';

      const result = await performAuthCheck();

      expect(result).toBe(true);
    });
  });

  describe('Claude CLI Authentication Failures', () => {
    it('should fail when Claude CLI is not found', async () => {
      mockSpawn.mockReturnValue(
        createMockChild(
          '',
          'claude: command not found',
          -1,
          new Error('Command not found')
        )
      );

      const result = await performAuthCheck();

      expect(result).toBe(false);
    });

    it('should fail when Claude CLI reports authentication required', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChild('claude version 1.0.0', '', 0);
        } else {
          return createMockChild('Please run `/login` to authenticate', '', 1);
        }
      });

      const result = await performAuthCheck();

      expect(result).toBe(false);
    });

    it('should fail when Claude CLI output indicates invalid API key', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChild('claude version 1.0.0', '', 0);
        } else {
          return createMockChild('Invalid API key', '', 0);
        }
      });

      const result = await performAuthCheck();

      expect(result).toBe(false);
    });

    it('should fail when Claude CLI output indicates not authenticated', async () => {
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockChild('claude version 1.0.0', '', 0);
        } else {
          return createMockChild('not authenticated', '', 0);
        }
      });

      const result = await performAuthCheck();

      expect(result).toBe(false);
    });
  });
});
