import { jest } from '@jest/globals';

import type { WorkspaceAnalysis } from '~/types/analysis';

export function mockClaudeAnalysis(analysisResult: WorkspaceAnalysis) {
  const mockQuery = jest.fn().mockImplementation(async function* () {
    yield {
      type: 'result',
      subtype: 'success',
      result: JSON.stringify(analysisResult),
      total_cost_usd: 0.01,
      num_turns: 1,
    };
  });

  jest.doMock('@anthropic-ai/claude-code', () => ({
    query: mockQuery,
  }));

  return mockQuery;
}
