import { jest } from '@jest/globals';
import type { TestFixture } from './fixture-loader';

export function mockFileSystemForFixture(fixture: TestFixture) {
  const mockedFs = {
    existsSync: jest.fn((path: string) => {
      const normalizedPath = path.replace(/^\/workspace\/[^/]+\//, '');
      return fixture.files.has(normalizedPath);
    }),
    
    readFileSync: jest.fn((path: string) => {
      const normalizedPath = path.replace(/^\/workspace\/[^/]+\//, '');
      const content = fixture.files.get(normalizedPath);
      if (!content) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return content;
    }),
    
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
    unlinkSync: jest.fn()
  };

  jest.doMock('fs', () => mockedFs);
  
  return mockedFs;
}