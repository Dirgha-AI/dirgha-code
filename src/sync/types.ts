export interface KnowledgeAPIConfig {
  baseUrl: string;
  apiKey: string;
  orgId?: string;
  projectId?: string;
}

export interface CloudFact {
  id: string;
  content: string;
  embedding?: number[];
  tags: string[];
  projectId: string;
  orgId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SyncStatus {
  projectId?: string;
  localFacts: number;
  cloudFacts: number;
  pendingUploads: number;
  pendingDownloads: number;
  lastSyncAt: string | null;
  conflicts: number;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
}
