/**
 * security/types.ts — Security scanner types
 * Pattern-based detection
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SecurityFinding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
  remediation: string;
  category: 'prompt-injection' | 'data-exfiltration' | 'command-injection' | 'malicious-code' | 'supply-chain' | 'secrets' | 'vulnerability';
  confidence: 'high' | 'medium' | 'low';
  metadata: Record<string, unknown>;
}

export interface ScanResult {
  file: string;
  findings: SecurityFinding[];
  maxSeverity: Severity | null;
  isSafe: boolean;
  durationMs: number;
  scannedAt: string;
}

export interface ScanOptions {
  checkPromptInjection?: boolean;
  checkDataExfiltration?: boolean;
  checkCommandInjection?: boolean;
  checkMaliciousCode?: boolean;
  checkSupplyChain?: boolean;
  checkSecrets?: boolean;
  failOnSeverity?: Severity;
  useLLM?: boolean;
  llmModel?: string;
  customRules?: string[];
}

export interface SecurityRule {
  id: string;
  name: string;
  category: SecurityFinding['category'];
  severity: Severity;
  pattern: RegExp;
  description: string;
  remediation: string;
}

export interface Analyzer {
  name: string;
  analyze(filePath: string, content: string): Promise<SecurityFinding[]>;
}
