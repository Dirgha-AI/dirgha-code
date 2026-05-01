import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export interface LanguageServerInfo {
  id: string;
  name: string;
  extensions: string[];
  command: string;
  args: string[];
  detect(): boolean;
  findRoot(filePath: string): string | undefined;
}

function which(cmd: string): string | null {
  try {
    const result = execSync(
      process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

function existsSync(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findUp(dir: string, targets: string[]): string | undefined {
  let current = path.resolve(dir);
  const root = path.parse(current).root;
  while (current.length >= root.length) {
    for (const target of targets) {
      if (existsSync(path.join(current, target))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

const TYPESCRIPT_SERVER: LanguageServerInfo = {
  id: "typescript",
  name: "TypeScript Language Server",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  command: "typescript-language-server",
  args: ["--stdio"],
  detect() {
    return which("typescript-language-server") !== null;
  },
  findRoot(filePath: string) {
    return findUp(path.dirname(filePath), [
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lockb",
      "package.json",
      "tsconfig.json",
    ]);
  },
};

const PYRIGHT_SERVER: LanguageServerInfo = {
  id: "pyright",
  name: "Pyright Language Server",
  extensions: [".py", ".pyi"],
  command: "pyright-langserver",
  args: ["--stdio"],
  detect() {
    return which("pyright-langserver") !== null;
  },
  findRoot(filePath: string) {
    return findUp(path.dirname(filePath), [
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "requirements.txt",
      "Pipfile",
      "pyrightconfig.json",
    ]);
  },
};

const RUST_ANALYZER_SERVER: LanguageServerInfo = {
  id: "rust-analyzer",
  name: "Rust Analyzer Language Server",
  extensions: [".rs"],
  command: "rust-analyzer",
  args: [],
  detect() {
    return which("rust-analyzer") !== null;
  },
  findRoot(filePath: string) {
    const root = findUp(path.dirname(filePath), ["Cargo.toml", "Cargo.lock"]);
    if (!root) return undefined;
    let current = root;
    const fsRoot = path.parse(current).root;
    while (current.length >= fsRoot.length) {
      const cargoToml = path.join(current, "Cargo.toml");
      try {
        const content = fs.readFileSync(cargoToml, "utf8");
        if (content.includes("[workspace]")) return current;
      } catch {
        /* ignore */
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return root;
  },
};

const GOPLS_SERVER: LanguageServerInfo = {
  id: "gopls",
  name: "Go Language Server (gopls)",
  extensions: [".go"],
  command: "gopls",
  args: [],
  detect() {
    return which("gopls") !== null;
  },
  findRoot(filePath: string) {
    const dir = path.dirname(filePath);
    const workRoot = findUp(dir, ["go.work"]);
    if (workRoot) return workRoot;
    return findUp(dir, ["go.mod", "go.sum"]);
  },
};

export const KNOWN_SERVERS: LanguageServerInfo[] = [
  TYPESCRIPT_SERVER,
  PYRIGHT_SERVER,
  RUST_ANALYZER_SERVER,
  GOPLS_SERVER,
];

const extensionMap = new Map<string, LanguageServerInfo>();
for (const server of KNOWN_SERVERS) {
  for (const ext of server.extensions) {
    if (!extensionMap.has(ext)) extensionMap.set(ext, server);
  }
}

export function getServerForFile(
  filePath: string,
): LanguageServerInfo | undefined {
  return extensionMap.get(path.extname(filePath));
}

export function detectInstalledServers(): LanguageServerInfo[] {
  return KNOWN_SERVERS.filter((s) => s.detect());
}

export function getLspRoot(
  filePath: string,
  server: LanguageServerInfo,
): string | undefined {
  const root = server.findRoot(filePath);
  if (root) return root;
  const dir = path.dirname(filePath);
  return existsSync(dir) ? dir : process.cwd();
}
