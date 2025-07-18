import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures');

export interface TestFixture {
  name: string;
  path: string;
  files: Map<string, string>;
}

export function loadTestFixture(fixtureName: string): TestFixture {
  const fixturePath = path.join(FIXTURES_DIR, fixtureName);
  
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Test fixture '${fixtureName}' not found`);
  }

  const files = new Map<string, string>();
  
  function loadFilesRecursively(dir: string, basePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        loadFilesRecursively(fullPath, relativePath);
      } else {
        const content = fs.readFileSync(fullPath, 'utf8');
        files.set(relativePath, content);
      }
    }
  }
  
  loadFilesRecursively(fixturePath);
  
  return {
    name: fixtureName,
    path: fixturePath,
    files
  };
}

export function getFileFromFixture(fixture: TestFixture, filePath: string): string | undefined {
  return fixture.files.get(filePath.replace(/^\//, ''));
}

export function getAvailableFixtures(): string[] {
  return fs.readdirSync(FIXTURES_DIR).filter(entry => {
    const stat = fs.statSync(path.join(FIXTURES_DIR, entry));
    return stat.isDirectory();
  });
}

export interface SetupFixtureOptions {
  addGitRepo?: boolean;
}

export function setupFixture(fixtureName: string, options: SetupFixtureOptions = {}): TestFixture {
  const { addGitRepo = false } = options;
  
  const fixture = loadTestFixture(fixtureName);
  const fixtureWithGit = { ...fixture };
  
  if (addGitRepo) {
    fixtureWithGit.files = new Map(fixture.files);
    fixtureWithGit.files.set('.git/.gitkeep', '');
  }
  
  return fixtureWithGit;
}