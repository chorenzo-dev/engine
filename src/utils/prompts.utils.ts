import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = __dirname.endsWith('dist') 
  ? join(__dirname, 'prompts')
  : join(__dirname, '..', 'prompts');

export function loadPrompt(promptName: string): string {
  const promptPath = join(PROMPTS_DIR, `${promptName}.md`);
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to load prompt ${promptName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function renderPrompt(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
  }
  return rendered;
}