/**
 * hub/types.ts — CLI-Hub plugin system types.
 * Registry and manifest formats for plugin ecosystem.
 */

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  main: string;           // Entry point (e.g., "index.js")
  bin?: string;           // CLI command name
  keywords: string[];
  categories: PluginCategory[];
  repository?: string;    // GitHub URL
  homepage?: string;
  
  // Runtime requirements
  engines: {
    node?: string;
    dirgha?: string;
  };
  
  // Dependencies
  dependencies?: Record<string, string>;
  
  // Plugin capabilities
  capabilities: PluginCapability[];
  
  // Installation metadata
  installed?: {
    path: string;
    version: string;
    installedAt: string;
    updatedAt?: string;
  };
}

export type PluginCategory =
  | 'ai-model'      // LLM providers
  | 'tool'          // CLI tools
  | 'integration'   // External services
  | 'theme'         // UI themes
  | 'language'      // Language support
  | 'workflow';     // Pre-built workflows

export interface PluginCapability {
  type: 'command' | 'hook' | 'provider' | 'theme';
  name: string;
  description: string;
}

export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  categories: PluginCategory[];
  keywords?: string[];
  downloads: number;
  rating: number;      // 0-5
  updatedAt: string;
  
  // Install sources
  sources: {
    npm?: string;      // npm package name
    github?: string;   // owner/repo
    url?: string;      // Direct download URL
  };
  
  // Verification
  checksum?: string;
  signature?: string;
}

export interface Registry {
  version: string;
  updatedAt: string;
  plugins: RegistryEntry[];
  categories: Record<PluginCategory, number>;
}

export interface InstallOptions {
  version?: string;     // Specific version
  global?: boolean;     // System-wide install
  force?: boolean;      // Reinstall if exists
  dryRun?: boolean;     // Preview only
}

export interface InstallResult {
  success: boolean;
  plugin: PluginManifest;
  path: string;
  action: 'installed' | 'updated' | 'skipped';
  previousVersion?: string;
  dependencies: string[];
}
