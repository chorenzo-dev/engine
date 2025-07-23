import { distance } from 'fastest-levenshtein';
import { readYaml } from './yaml.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = __dirname.endsWith('dist')
  ? path.join(__dirname, 'resources')
  : path.join(__dirname, '..', 'resources');

interface FrameworkDatabase {
  [ecosystem: string]: {
    [projectType: string]: string[];
  };
}

export async function validateFrameworks(analysis: WorkspaceAnalysis): Promise<{
  validatedAnalysis: WorkspaceAnalysis;
  unrecognizedFrameworks: string[];
}> {
  const frameworksPath = path.join(RESOURCES_DIR, 'frameworks.yaml');
  const frameworkDb: FrameworkDatabase = await readYaml(frameworksPath);

  const unrecognizedFrameworks: string[] = [];

  const validatedProjects = analysis.projects.map((project) => {
    if (!project.framework) {
      return project;
    }

    const projectEcosystem = project.ecosystem || 'javascript';
    const ecosystemFrameworks = getAllFrameworks(frameworkDb, projectEcosystem);

    const normalizedFramework = normalizeFrameworkName(project.framework);
    const normalizedKnownFrameworks = ecosystemFrameworks.map(
      normalizeFrameworkName
    );

    const exactMatchIndex =
      normalizedKnownFrameworks.indexOf(normalizedFramework);
    if (exactMatchIndex >= 0) {
      return { ...project, framework: ecosystemFrameworks[exactMatchIndex] };
    }

    const bestMatch = findBestFrameworkMatch(
      normalizedFramework,
      normalizedKnownFrameworks
    );
    if (bestMatch) {
      const originalMatchIndex = normalizedKnownFrameworks.indexOf(bestMatch);
      return { ...project, framework: ecosystemFrameworks[originalMatchIndex] };
    }

    unrecognizedFrameworks.push(project.framework);
    return project;
  });

  return {
    validatedAnalysis: {
      ...analysis,
      projects: validatedProjects,
    },
    unrecognizedFrameworks,
  };
}

function getAllFrameworks(
  frameworkDb: FrameworkDatabase,
  ecosystem?: string
): string[] {
  const frameworks: string[] = [];

  if (ecosystem && frameworkDb[ecosystem]) {
    for (const projectTypes of Object.values(frameworkDb[ecosystem])) {
      frameworks.push(...projectTypes);
    }
  } else {
    for (const ecosystemData of Object.values(frameworkDb)) {
      for (const projectTypes of Object.values(ecosystemData)) {
        frameworks.push(...projectTypes);
      }
    }
  }

  return [...new Set(frameworks)];
}

function normalizeFrameworkName(framework: string): string {
  return framework
    .toLowerCase()
    .trim()
    .replace(/\./g, '') // Remove dots: "express.js" -> "expressjs"
    .replace(/[\s/\\]+/g, '-') // Replace spaces and slashes with dashes: "react native" -> "react-native"
    .replace(/-+/g, '-') // Collapse multiple dashes: "react--native" -> "react-native"
    .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
}

function findBestFrameworkMatch(
  target: string,
  knownFrameworks: string[]
): string | null {
  const similarities = knownFrameworks.map((framework) => ({
    framework,
    distance: distance(target, framework),
  }));

  similarities.sort((a, b) => a.distance - b.distance);

  const threshold = 2;
  const bestMatch = similarities[0];

  return bestMatch && bestMatch.distance <= threshold
    ? bestMatch.framework
    : null;
}
