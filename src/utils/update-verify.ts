// packages/cli/src/utils/update-verify.ts

const MANIFEST_URL = 'https://dirgha.ai/.well-known/cli-versions.json';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@dirgha%2Fcode/latest';
const TIMEOUT_MS = 5000;
const FALLBACK_VERSION = '2.0.0';

interface Manifest {
  cli: {
    version: string;
    sha256: string;
    publishedAt: string;
  };
}

interface NpmPackageInfo {
  version: string;
  dist: {
    shasum: string;
  };
}

function getCurrentVersion(): string {
  return process.env.npm_package_version || FALLBACK_VERSION;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(MANIFEST_URL);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as Manifest;
    return data.cli?.version ?? null;
  } catch {
    return null;
  }
}

export async function checkUpdateIntegrity(): Promise<{
  updateAvailable: boolean;
  version: string;
  integrityOk: boolean;
  currentVersion: string;
}> {
  const currentVersion = getCurrentVersion();

  try {
    const [manifestRes, npmRes] = await Promise.all([
      fetchWithTimeout(MANIFEST_URL),
      fetchWithTimeout(NPM_REGISTRY_URL)
    ]);

    if (!manifestRes.ok || !npmRes.ok) {
      throw new Error('Failed to fetch manifest or registry');
    }

    const manifest = (await manifestRes.json()) as Manifest;
    const npmInfo = (await npmRes.json()) as NpmPackageInfo;

    const version = manifest.cli.version;
    const integrityOk = manifest.cli.sha256 === npmInfo.dist.shasum;
    const updateAvailable = version !== currentVersion;

    return {
      updateAvailable,
      version,
      integrityOk,
      currentVersion
    };
  } catch {
    return {
      updateAvailable: false,
      version: 'unknown',
      integrityOk: false,
      currentVersion
    };
  }
}
