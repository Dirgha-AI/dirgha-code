export interface ExecutionConfig {
  timeouts: Record<string, number>;
  retries: Record<string, number>;
  memory: {
    warning: number;
    critical: number;
    max: number;
  };
  paste: {
    maxLines: number;
    maxChars: number;
    previewLength: number;
  };
  output: {
    maxBytes: number;
    progressInterval: number;
    chunkSize: number;
  };
}

export const EXECUTION_CONFIG: ExecutionConfig = {
  timeouts: {
    default: 30000,
    quick: 10000,
    git: 60000,
    build: 120000,
    test: 60000,
    install: 180000,
    search: 10000,
    largeFile: 300000,
    network: 45000,
  },

  retries: {
    default: 2,
    network: 3,
    git: 1,
    critical: 3,
  },

  memory: {
    warning: 200 * 1024 * 1024,
    critical: 500 * 1024 * 1024,
    max: 1024 * 1024 * 1024,
  },

  paste: {
    maxLines: 1000,
    maxChars: 50000,
    previewLength: 200,
  },

  output: {
    maxBytes: 100000,
    progressInterval: 1000,
    chunkSize: 100,
  },
};

export const getTimeoutForCommand = (command: string): number => {
  const cmd = command.toLowerCase();
  if (cmd.includes('git')) return EXECUTION_CONFIG.timeouts.git;
  if (cmd.includes('build') || cmd.includes('compile')) return EXECUTION_CONFIG.timeouts.build;
  if (cmd.includes('test')) return EXECUTION_CONFIG.timeouts.test;
  if (cmd.includes('install') || cmd.includes('npm') || cmd.includes('pnpm')) return EXECUTION_CONFIG.timeouts.install;
  if (cmd.includes('search') || cmd.includes('grep') || cmd.includes('find')) return EXECUTION_CONFIG.timeouts.search;
  if (cmd.includes('curl') || cmd.includes('wget') || cmd.includes('fetch')) return EXECUTION_CONFIG.timeouts.network;
  return EXECUTION_CONFIG.timeouts.default;
};

export const getRetriesForCommand = (command: string): number => {
  const cmd = command.toLowerCase();
  if (cmd.includes('curl') || cmd.includes('wget') || cmd.includes('fetch')) return EXECUTION_CONFIG.retries.network;
  if (cmd.includes('git')) return EXECUTION_CONFIG.retries.git;
  return EXECUTION_CONFIG.retries.default;
};
