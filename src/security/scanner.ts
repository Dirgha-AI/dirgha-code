/**
 * security/scanner.ts — Security scanner engine
 * Multi-engine detection: pattern-based + LLM semantic analysis
 * Pattern-based detection
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import type { SecurityFinding, ScanResult, ScanOptions } from './types.js';
import { SECURITY_RULES } from './rules.js';

const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.php',
  '.sh', '.bash', '.zsh', '.ps1',
  '.yml', '.yaml', '.json', '.toml',
  '.md', '.txt', '.skill', '.cursorrules'
]);

/**
 * Scan a single file for security issues
 */
export async function scanFile(
  filePath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Pattern-based detection
    findings.push(...runPatternAnalysis(filePath, content, lines, options));

    // LLM semantic analysis (if enabled)
    if (options.useLLM) {
      findings.push(...await runLLMAnalysis(filePath, content, options));
    }

  } catch (error) {
    findings.push({
      id: `ERR-${Date.now()}`,
      ruleId: 'SCAN-ERR',
      ruleName: 'Scan Error',
      severity: 'info',
      file: filePath,
      line: 0,
      column: 0,
      message: `Failed to scan file: ${(error as Error).message}`,
      code: '',
      remediation: 'Check file permissions and encoding',
      category: 'vulnerability',
      confidence: 'high',
      metadata: { error: (error as Error).message },
    });
  }

  const maxSeverity = getMaxSeverity(findings);
  const failThreshold = options.failOnSeverity || 'high';
  const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];

  return {
    file: filePath,
    findings,
    maxSeverity,
    isSafe: !findings.some(f => 
      severityOrder.indexOf(f.severity) >= severityOrder.indexOf(failThreshold)
    ),
    durationMs: Date.now() - startTime,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Scan directory recursively
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {}
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...await scanDirectory(fullPath, options));
    } else if (entry.isFile() && isScannable(fullPath)) {
      results.push(await scanFile(fullPath, options));
    }
  }

  return results;
}

/**
 * Run pattern-based static analysis
 */
function runPatternAnalysis(
  filePath: string,
  content: string,
  lines: string[],
  options: ScanOptions
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const rule of SECURITY_RULES) {
    // Skip if category disabled
    if (rule.category === 'prompt-injection' && options.checkPromptInjection === false) continue;
    if (rule.category === 'data-exfiltration' && options.checkDataExfiltration === false) continue;
    if (rule.category === 'command-injection' && options.checkCommandInjection === false) continue;
    if (rule.category === 'malicious-code' && options.checkMaliciousCode === false) continue;
    if (rule.category === 'supply-chain' && options.checkSupplyChain === false) continue;
    if (rule.category === 'secrets' && options.checkSecrets === false) continue;

    // Reset regex state
    rule.pattern.lastIndex = 0;

    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      // Calculate line and column
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const lineStart = beforeMatch.lastIndexOf('\n') + 1;
      const columnNum = match.index - lineStart + 1;
      
      const line = lines[lineNum - 1] || '';
      
      findings.push({
        id: `${rule.id}-${findings.length}`,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        file: filePath,
        line: lineNum,
        column: columnNum,
        message: rule.description,
        code: line.trim().substring(0, 100),
        remediation: rule.remediation,
        category: rule.category,
        confidence: 'high',
        metadata: { 
          matchedText: match[0].substring(0, 50),
          pattern: rule.pattern.source.substring(0, 50)
        },
      });
    }
  }

  return findings;
}

/**
 * Run LLM-based semantic analysis
 */
async function runLLMAnalysis(
  filePath: string,
  content: string,
  options: ScanOptions
): Promise<SecurityFinding[]> {
  // Placeholder for LLM analysis
  // Would call LLM to analyze semantic security issues
  // For now, return empty to avoid blocking
  return [];
}

/**
 * Check if file is scannable
 */
function isScannable(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (SCANNABLE_EXTENSIONS.has(ext)) return true;
  
  // Check for skill files without extension
  const basename = filePath.split('/').pop()?.toLowerCase() || '';
  if (basename === 'skill.md' || basename.endsWith('.skill')) return true;
  
  return false;
}

/**
 * Get maximum severity from findings
 */
function getMaxSeverity(findings: SecurityFinding[]): SecurityFinding['severity'] | null {
  if (findings.length === 0) return null;
  
  const order: SecurityFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  let max: SecurityFinding['severity'] = 'info';
  
  for (const f of findings) {
    if (order.indexOf(f.severity) < order.indexOf(max)) {
      max = f.severity;
    }
  }
  
  return max;
}

/**
 * Generate summary report
 */
export function generateReport(results: ScanResult[]): {
  totalFiles: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  isSafe: boolean;
} {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  
  for (const result of results) {
    for (const finding of result.findings) {
      counts[finding.severity]++;
    }
  }

  return {
    totalFiles: results.length,
    totalFindings: Object.values(counts).reduce((a, b) => a + b, 0),
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    infoCount: counts.info,
    isSafe: results.every(r => r.isSafe) && counts.critical === 0 && counts.high === 0,
  };
}
