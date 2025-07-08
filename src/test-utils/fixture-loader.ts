import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'test-fixtures');

export interface TestFixture {
  name: string;
  path: string;
  files: Map<string, string>;
  packageJson: Record<string, unknown> | null;
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
  
  const packageJsonPath = path.join(fixturePath, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath) 
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>
    : null;
  
  return {
    name: fixtureName,
    path: fixturePath,
    files,
    packageJson
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