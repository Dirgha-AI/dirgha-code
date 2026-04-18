/**
 * Curate Types and Interfaces
 * @module commands/curate/types
 */

export interface FactFile {
  factId: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface Fact {
  id: string;
  content: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  projectId?: string;
}

export interface CurateOptions {
  files?: string[];
  tags?: string[];
  embed?: boolean;
  project?: boolean;
  provider?: string;
}
