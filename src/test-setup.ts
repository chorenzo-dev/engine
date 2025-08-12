import { afterEach, beforeEach, jest } from '@jest/globals';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

process.env['NODE_ENV'] = 'test';
