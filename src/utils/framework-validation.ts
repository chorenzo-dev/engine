import { distance } from 'fastest-levenshtein';
import { readYaml } from './yaml.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import * as path from 'path';

interface FrameworkDatabase {
  [ecosystem: string]: {
    [projectType: string]: string[];
  };
}

interface AmbiguousFramework {
  projectPath: string;
  originalFramework: string;
  suggestions: string[];
}

export async function validateFrameworks(analysis: WorkspaceAnalysis): Promise<{
  validatedAnalysis: WorkspaceAnalysis;
  ambiguousFrameworks: AmbiguousFramework[];
}> {
  const frameworksPath = path.join(process.cwd(), 'src', 'resources', 'frameworks.yaml');
  const frameworkDb: FrameworkDatabase = await readYaml(frameworksPath);
  
  const allKnownFrameworks = getAllFrameworks(frameworkDb);
  const ambiguousFrameworks: AmbiguousFramework[] = [];
  
  const validatedProjects = analysis.projects.map(project => {
    if (!project.framework) {
      return project;
    }
    
    const normalizedFramework = normalizeFrameworkName(project.framework);
    
    if (allKnownFrameworks.includes(normalizedFramework)) {
      return { ...project, framework: normalizedFramework };
    }
    
    const suggestions = findSimilarFrameworks(normalizedFramework, allKnownFrameworks);
    if (suggestions.length > 0) {
      ambiguousFrameworks.push({
        projectPath: project.path,
        originalFramework: project.framework,
        suggestions
      });
    }
    
    return project;
  });
  
  return {
    validatedAnalysis: {
      ...analysis,
      projects: validatedProjects
    },
    ambiguousFrameworks
  };
}

function getAllFrameworks(frameworkDb: FrameworkDatabase): string[] {
  const frameworks: string[] = [];
  
  for (const ecosystem of Object.values(frameworkDb)) {
    for (const projectTypes of Object.values(ecosystem)) {
      frameworks.push(...projectTypes);
    }
  }
  
  return [...new Set(frameworks)];
}

function normalizeFrameworkName(framework: string): string {
  return framework.toLowerCase().trim();
}

function findSimilarFrameworks(target: string, knownFrameworks: string[], maxSuggestions = 5): string[] {
  const similarities = knownFrameworks.map(framework => ({
    framework,
    distance: distance(target, framework)
  }));
  
  similarities.sort((a, b) => a.distance - b.distance);
  
  const threshold = Math.max(2, Math.ceil(target.length * 0.4));
  
  return similarities
    .filter(item => item.distance <= threshold)
    .slice(0, maxSuggestions)
    .map(item => item.framework);
}

export function createFrameworkClarificationPrompt(ambiguousFrameworks: AmbiguousFramework[]): string {
  const clarifications = ambiguousFrameworks.map(item => {
    const suggestionsText = item.suggestions.length > 0 
      ? `- Did you mean: ${item.suggestions.join(', ')}`
      : '- No similar frameworks found';
    
    return `Project "${item.projectPath}" framework "${item.originalFramework}":
${suggestionsText}
- Or keep: ${item.originalFramework}`;
  }).join('\n\n');

  return `Please update the analysis.json file with the correct framework names. For these ambiguous frameworks:

${clarifications}

Update the analysis.json file with your final decisions.`;
}