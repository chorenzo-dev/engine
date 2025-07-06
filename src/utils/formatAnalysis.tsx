import React from 'react';
import { Text, Box } from 'ink';
import { WorkspaceAnalysis, ProjectAnalysis } from '../types/analysis';

export const FormatAnalysis: React.FC<{ analysis: WorkspaceAnalysis }> = ({ analysis }) => {
  const { isMonorepo, workspaceEcosystem, projects } = analysis;

  if (isMonorepo) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>📁 Workspace Structure</Text>
        <Text>├─ Type: Monorepo</Text>
        {workspaceEcosystem ? <Text>└─ Ecosystem: {capitalize(workspaceEcosystem)}</Text> : <Text>└─ Ecosystem: Unknown</Text>}
        
        <Box marginTop={1}>
          <Text color="blue" bold>📦 Projects ({projects.length})</Text>
        </Box>
        {projects.map((project, index) => (
          <Box key={project.path} flexDirection="column">
            <Text>{index === projects.length - 1 ? '└─' : '├─'} {project.path}</Text>
            <Box flexDirection="column" marginLeft={3}>
              <Text>├─ Type: {formatProjectType(project.type)}</Text>
              <Text>└─ Language: {capitalize(project.language)}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else {
    const project = projects[0];
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>📁 Project Analysis</Text>
        <Text>Type: {formatProjectType(project.type)}</Text>
        <Text>Language: {capitalize(project.language)}</Text>
        <Text>Package Manager: {getPackageManager(project)}</Text>
        <Box marginTop={1} />
      </Box>
    );
  }
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatProjectType(type: ProjectAnalysis['type']): string {
  const typeMap: Record<ProjectAnalysis['type'], string> = {
    cli_tool: 'CLI Tool',
    web_app: 'Web App',
    api_server: 'API Server',
    backend_service: 'Backend Service',
    library: 'Library/Package',
    script: 'Script',
    infrastructure: 'Infrastructure',
    desktop_app: 'Desktop App',
    mobile_app: 'Mobile App',
    unknown: 'Unknown',
  };
  return typeMap[type];
}

function getPackageManager(project: ProjectAnalysis): string {
  if (!project.hasPackageManager) return 'None';
  if (project.ecosystem === 'javascript') return 'npm/yarn/pnpm';
  return project.ecosystem || 'Unknown';
}