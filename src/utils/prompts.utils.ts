import { existsSync, readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = __dirname.endsWith('dist')
  ? join(__dirname, 'prompts')
  : join(__dirname, '..', 'prompts');
const TEMPLATES_DIR = __dirname.endsWith('dist')
  ? join(__dirname, 'templates')
  : join(__dirname, '..', 'templates');
const DOCS_DIR = __dirname.endsWith('dist')
  ? join(__dirname, 'docs')
  : join(__dirname, '..', '..', 'docs');

export function loadPrompt(promptName: string): string {
  const promptPath = join(PROMPTS_DIR, `${promptName}.md.hbs`);
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to load prompt ${promptName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function loadTemplate(
  templateName: string,
  extension: string = 'md'
): string {
  const templatePath = join(
    TEMPLATES_DIR,
    'recipe',
    `${templateName}.${extension}.hbs`
  );
  try {
    return readFileSync(templatePath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to load template ${templateName}.${extension}.hbs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function renderPrompt(
  template: string,
  variables: Record<string, string | number | boolean>
): string {
  const compiledTemplate = Handlebars.compile(template, { noEscape: true });
  return compiledTemplate(variables);
}

export function loadDoc(docName: string): string {
  const docPath = join(DOCS_DIR, `${docName}.md`);
  if (existsSync(docPath)) {
    return readFileSync(docPath, 'utf-8');
  }
  return '';
}
