import { z } from 'zod';

import { CiCdSystem, Ecosystem, ProjectType } from '../types/analysis';

export const ProjectTypeSchema = z.nativeEnum(ProjectType);
export const CiCdSystemSchema = z.nativeEnum(CiCdSystem);
export const EcosystemSchema = z.nativeEnum(Ecosystem);

export const ProjectAnalysisSchema = z
  .object({
    path: z.string().min(1, 'Project path cannot be empty'),
    language: z.string().min(1, 'Language cannot be empty'),
    type: ProjectTypeSchema,
    framework: z.string().optional(),
    dependencies: z.array(z.string()).default([]),
    hasPackageManager: z.boolean(),
    ecosystem: EcosystemSchema.optional(),
    dockerized: z.boolean().optional(),
  })
  .strict();

export const WorkspaceAnalysisSchema = z
  .object({
    isMonorepo: z.boolean(),
    hasWorkspacePackageManager: z.boolean(),
    workspaceEcosystem: EcosystemSchema.optional(),
    workspaceDependencies: z.array(z.string()).optional().default([]),
    projects: z
      .array(ProjectAnalysisSchema)
      .min(1, 'At least one project must be present'),
    ciCd: CiCdSystemSchema.optional(),
  })
  .strict();

export type ProjectAnalysisType = z.infer<typeof ProjectAnalysisSchema>;
export type WorkspaceAnalysisType = z.infer<typeof WorkspaceAnalysisSchema>;
