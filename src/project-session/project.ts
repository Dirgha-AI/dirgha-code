/**
 * project-session/project.ts — Project CRUD and detection
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Project, ProjectConfig, ProjectStats } from './types.js';

function getDirghaDir() {
  return join(homedir(), '.dirgha');
}

export class ProjectManager {
  private projects: Map<string, Project> = new Map();

  constructor() {
    this.ensureDirectories();
    this.loadProjects();
  }

  private ensureDirectories(): void {
    mkdirSync(join(getDirghaDir(), 'projects'), { recursive: true });
  }

  private loadProjects(): void {
    const projectsDir = join(getDirghaDir(), 'projects');
    if (!existsSync(projectsDir)) return;
    
    try {
      const dirs = readdirSync(projectsDir);
      for (const id of dirs) {
        const metaPath = join(projectsDir, id, 'meta.json');
        if (existsSync(metaPath)) {
          const project = JSON.parse(readFileSync(metaPath, 'utf-8'));
          this.projects.set(id, project);
        }
      }
    } catch { /* ignore */ }
  }

  private generateId(path: string): string {
    return createHash('sha256').update(path).digest('hex').slice(0, 12);
  }

  init(path: string, name: string): Project {
    const id = this.generateId(path);
    const now = new Date().toISOString();
    
    const project: Project = {
      id,
      name,
      path,
      createdAt: now,
      updatedAt: now,
      config: {
        defaultModel: 'claude-3-sonnet',
        autoSwitch: true,
        linkedProjects: [],
        ignorePatterns: ['node_modules/', '.git/', 'dist/', 'build/'],
        maxContextSize: 200000
      },
      stats: {
        sessionCount: 0,
        totalTokensUsed: 0,
        lastAccessed: now
      }
    };

    const projectsDir = join(getDirghaDir(), 'projects');
    const projectDir = join(projectsDir, id);
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, 'sessions'), { recursive: true });
    
    writeFileSync(
      join(projectDir, 'meta.json'),
      JSON.stringify(project, null, 2)
    );

    this.projects.set(id, project);
    return project;
  }

  detect(cwd: string): Project | null {
    for (const project of this.projects.values()) {
      if (cwd.startsWith(project.path)) {
        return project;
      }
    }
    return null;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  list(): Project[] {
    return Array.from(this.projects.values());
  }

  switch(id: string): Project | null {
    const project = this.projects.get(id);
    if (project) {
      project.stats.lastAccessed = new Date().toISOString();
      project.updatedAt = new Date().toISOString();
      
      const projectsDir = join(getDirghaDir(), 'projects');
      writeFileSync(
        join(projectsDir, id, 'meta.json'),
        JSON.stringify(project, null, 2)
      );

      this.saveCurrentContext({ projectId: id, sessionId: 'main' });
    }
    return project || null;
  }

  delete(id: string): boolean {
    const project = this.projects.get(id);
    if (!project) return false;
    
    this.projects.delete(id);
    return true;
  }

  private saveCurrentContext(context: { projectId: string; sessionId: string }): void {
    const contextsDir = join(getDirghaDir(), 'contexts');
    mkdirSync(contextsDir, { recursive: true });
    
    writeFileSync(
      join(contextsDir, 'current.json'),
      JSON.stringify(context, null, 2)
    );
  }
}
