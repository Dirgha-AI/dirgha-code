export interface ScanCommandOptions {
  recursive: boolean;
  deps: boolean;
  supplyChain: boolean;
  dir: string;
  promptInjection: boolean;
  dataExfiltration: boolean;
  commandInjection: boolean;
  maliciousCode: boolean;
  supplyChainCode: boolean;
  secrets: boolean;
  failOnSeverity: string;
  useLlm: boolean;
  format: string;
  output?: string;
}

export interface DepScanOptions {
  deps: boolean;
  supplyChain: boolean;
  dir: string;
}
