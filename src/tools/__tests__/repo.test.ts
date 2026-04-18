import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoMapTool } from '../repo.js';

describe('repoMapTool (AST-aware)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'repo-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts TypeScript symbols correctly using AST', () => {
    const tsContent = `
      export interface User { id: string; name: string; }
      export class AuthService {
        async login(u: string, p: string) { return true; }
        logout() {}
      }
      export function getVersion() { return '1.0.0'; }
      function internalHelper() {}
      export const API_URL = 'http://localhost';
    `;
    writeFileSync(join(tmpDir, 'auth.ts'), tsContent);

    const result = repoMapTool({ path: tmpDir });
    expect(result.error).toBeUndefined();
    
    const output = result.result;
    expect(output).toContain('📄 auth.ts');
    expect(output).toContain('interface User');
    expect(output).toContain('class AuthService { login, logout }');
    expect(output).toContain('fn getVersion()');
    expect(output).toContain('fn internalHelper()');
    expect(output).toContain('const API_URL');
  });

  it('falls back to regex for non-JS/TS files', () => {
    const pyContent = `
class Database:
    def connect(self):
        pass

async def fetch_data(id):
    return {}
    `;
    writeFileSync(join(tmpDir, 'db.py'), pyContent);

    const result = repoMapTool({ path: tmpDir });
    const output = result.result;
    
    expect(output).toContain('📄 db.py');
    expect(output).toContain('Database');
    expect(output).toContain('fetch_data');
  });

  it('respects depth parameter', () => {
    const subDir = join(tmpDir, 'src', 'inner');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'test.ts'), 'export const x = 1;');

    const resultDepth1 = repoMapTool({ path: tmpDir, depth: 1 });
    expect(resultDepth1.result).not.toContain('test.ts');

    const resultDepth3 = repoMapTool({ path: tmpDir, depth: 3 });
    expect(resultDepth3.result).toContain('test.ts');
  });
});
