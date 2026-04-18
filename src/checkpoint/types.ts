/**
 * checkpoint/types.ts — Checkpoint type definitions
 */
export interface Checkpoint {
  id: string;
  name: string;
  projectPath: string;
  files: CheckpointFile[];
  createdAt: string;
  commitHash?: string;
}

export interface CheckpointFile {
  path: string;
  hash: string;
  size: number;
}

export interface CheckpointMetadata {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  commitHash?: string;
}
