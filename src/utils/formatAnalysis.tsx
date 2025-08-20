import { Box, Text } from 'ink';
import React from 'react';

import { colors } from '~/styles/colors';
import {
  CiCdSystem,
  ProjectAnalysis,
  WorkspaceAnalysis,
} from '~/types/analysis';

export const FormatAnalysis: React.FC<{ analysis: WorkspaceAnalysis }> = ({
  analysis,
}) => {
  const {
    isMonorepo,
    workspaceEcosystem,
    hasWorkspacePackageManager,
    workspaceDependencies,
    projects,
    ciCd,
  } = analysis;

  if (isMonorepo) {
    return (
      <Box flexDirection="column">
        <Text color={colors.info} bold>
          Workspace Structure
        </Text>
        <Text>├─ Type: Monorepo</Text>
        {workspaceEcosystem ? (
          <Text>├─ Ecosystem: {capitalize(workspaceEcosystem)}</Text>
        ) : (
          <Text>├─ Ecosystem: Unknown</Text>
        )}
        <Text>
          ├─ Package Manager: {hasWorkspacePackageManager ? 'Yes' : 'No'}
        </Text>
        <Text>├─ CI/CD: {formatCiCd(ciCd)}</Text>
        {workspaceDependencies && workspaceDependencies.length > 0 ? (
          <Text>└─ Dependencies: {workspaceDependencies.length}</Text>
        ) : (
          <Text>└─ Dependencies: None</Text>
        )}

        <Box marginTop={1}>
          <Text color={colors.info} bold>
            Projects ({projects.length})
          </Text>
        </Box>
        {projects.map((project, index) => (
          <Box key={project.path} flexDirection="column">
            <Text>
              {index === projects.length - 1 ? '└─' : '├─'} {project.path}
            </Text>
            <Box flexDirection="column" marginLeft={3}>
              <Text>├─ Type: {formatProjectType(project.type)}</Text>
              <Text>├─ Language: {capitalize(project.language)}</Text>
              <Text>
                ├─ Framework:{' '}
                {project.framework ? capitalize(project.framework) : 'None'}
              </Text>
              <Text>
                ├─ Package Manager: {project.hasPackageManager ? 'Yes' : 'No'}
              </Text>
              <Text>└─ Docker: {project.dockerized ? 'Yes' : 'No'}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else {
    const project = projects[0];
    if (!project) {
      return (
        <Box flexDirection="column">
          <Text color={colors.info} bold>
            Project Analysis
          </Text>
          <Text>No projects found</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color={colors.info} bold>
          Project Analysis
        </Text>
        <Text>Type: {formatProjectType(project.type)}</Text>
        <Text>Language: {capitalize(project.language || 'Unknown')}</Text>
        <Text>
          Framework:{' '}
          {project.framework ? capitalize(project.framework) : 'None'}
        </Text>
        <Text>Package Manager: {project.hasPackageManager ? 'Yes' : 'No'}</Text>
        <Text>Docker: {project.dockerized ? 'Yes' : 'No'}</Text>
        <Text>CI/CD: {formatCiCd(ciCd)}</Text>
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

function formatCiCd(ciCd?: CiCdSystem): string {
  if (!ciCd || ciCd === 'none') {
    return 'None';
  }

  return ciCd
    .split('_')
    .map((word) => {
      const specialCases: Record<string, string> = {
        ci: 'CI',
        cd: 'CD',
        devops: 'DevOps',
      };

      return specialCases[word] || word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
