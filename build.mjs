import esbuild from 'esbuild';
import { chmodSync, statSync, readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const CLI_VERSION = pkg.version ?? '0.0.0';

const isDev = process.argv.includes('--dev');
const shouldAnalyze = process.argv.includes('--analyze');

const result = await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: ['node18'],
  format: 'esm',
  outfile: 'dist/dirgha.mjs',
  minify: !isDev,
  sourcemap: isDev,
  treeShaking: true,
  metafile: shouldAnalyze,
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __banner_createRequire } from "module";
import { fileURLToPath as __banner_fileURLToPath } from "url";
import { dirname as __banner_dirname } from "path";
const require = __banner_createRequire(import.meta.url);
const __filename = __banner_fileURLToPath(import.meta.url);
const __dirname = __banner_dirname(__filename);`,
  },
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    'process.env.DIRGHA_VERSION': JSON.stringify(CLI_VERSION),
    '__CLI_VERSION__': JSON.stringify(CLI_VERSION),
  },
  external: [
    'fsevents', 'better-sqlite3', '@dirgha/bucky', 'js-yaml', 'rxjs', 'es-toolkit', 'chromium-bidi',
    // Heavy optional deps — loaded at runtime if present, graceful fallback if not
    'typescript',           // repo_map tool — 3.4MB, optional code analysis
    'playwright',           // browser automation — 1.4MB, lazy loaded
    'playwright-core',      // browser automation — 1.4MB, lazy loaded
    '@libp2p/kad-dht',      // mesh networking — 387KB, only used in mesh commands
    'libp2p',               // mesh networking
    '@libp2p/tcp',
    '@libp2p/websockets',
    '@libp2p/mplex',
    '@libp2p/noise',
    '@libp2p/gossipsub',
    '@libp2p/interface',    // peer-id subpath too
    'libp2p-noise',
    '@chainsafe/libp2p-yamux',
  ],
  plugins: [
    {
      name: 'stub-heavy-internals',
      setup(build) {
        // Stub react-devtools-core (all import paths)
        build.onResolve({ filter: /react-devtools-core/ }, () => ({
          path: 'react-devtools-core',
          namespace: 'stub-empty',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub-empty' }, () => ({
          contents: 'export default null; export const connectToDevTools = () => {};',
          loader: 'js',
        }));
      },
    },
  ],
  loader: { '.md': 'text' },
  logLevel: 'info',
});

chmodSync('dist/dirgha.mjs', 0o755);

const stats = statSync('dist/dirgha.mjs');
const sizeKB = (stats.size / 1024).toFixed(2);

console.log(`✓ Build complete: dist/dirgha.mjs (${sizeKB} KB)`);

if (shouldAnalyze && result.metafile) {
  console.log('\n--- Bundle Analysis ---');
  const outputs = Object.entries(result.metafile.outputs);
  for (const [path, info] of outputs) {
    const outSizeKB = (info.bytes / 1024).toFixed(2);
    console.log(`${path}: ${outSizeKB} KB`);
  }
  
  // Show top 10 largest inputs
  const inputs = Object.entries(result.metafile.inputs)
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 10);
  
  console.log('\nTop 10 contributors:');
  for (const [path, info] of inputs) {
    const pct = ((info.bytesInOutput / stats.size) * 100).toFixed(1);
    console.log(`  ${path}: ${(info.bytesInOutput / 1024).toFixed(2)} KB (${pct}%)`);
  }
}
