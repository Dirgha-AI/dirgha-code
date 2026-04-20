/**
 * hub/registry.ts — Registry management for CLI-Hub.
 * Fetch, cache, and search plugin registry.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Registry, RegistryEntry, PluginCategory } from './types.js';
// Bundled registry — used as fallback when the remote registry is unreachable
// (offline, pre-launch, or hub host 404). Keeps `hub list` / `hub search`
// usable before the registry service exists. esbuild inlines this JSON.
import bundledRegistry from './registry.json' with { type: 'json' };

const REGISTRY_URL = 'https://dirgha.ai/api/hub/registry.json';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheDir(): string {
  const dir = join(homedir(), '.dirgha', 'hub');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getCachePath(): string {
  return join(getCacheDir(), 'registry.json');
}

function getCacheMetaPath(): string {
  return join(getCacheDir(), 'registry.meta.json');
}

/** Fetch registry from remote or cache. */
export async function fetchRegistry(): Promise<Registry> {
  const cachePath = getCachePath();
  const metaPath = getCacheMetaPath();
  
  // Check cache freshness
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const age = Date.now() - meta.fetchedAt;
    if (age < CACHE_TTL_MS && existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
  }
  
  // Fetch fresh
  try {
    const res = await fetch(REGISTRY_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const registry: Registry = await res.json();

    // Cache it
    writeFileSync(cachePath, JSON.stringify(registry, null, 2), 'utf-8');
    writeFileSync(metaPath, JSON.stringify({ fetchedAt: Date.now() }), 'utf-8');

    return registry;
  } catch {
    // Fall back to stale disk cache, then to the bundled registry. The bundled
    // copy is shipped with the CLI so hub commands work offline or before the
    // remote registry service exists.
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
    return bundledRegistry as Registry;
  }
}

/** Search plugins by keyword. */
export async function searchPlugins(query: string, category?: PluginCategory): Promise<RegistryEntry[]> {
  const registry = await fetchRegistry();
  const q = query.toLowerCase();
  
  return registry.plugins.filter(p => {
    const matchesQuery = 
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.keywords?.some((k: string) => k.toLowerCase().includes(q));
    
    const matchesCategory = !category || p.categories.includes(category);
    
    return matchesQuery && matchesCategory;
  }).sort((a, b) => b.rating - a.rating || b.downloads - a.downloads);
}

/** Get single plugin info. */
export async function getPlugin(name: string): Promise<RegistryEntry | undefined> {
  const registry = await fetchRegistry();
  return registry.plugins.find(p => p.name === name || p.name === `dirgha-${name}`);
}

/** List all categories with counts. */
export async function listCategories(): Promise<Record<PluginCategory, number>> {
  const registry = await fetchRegistry();
  return registry.categories;
}
