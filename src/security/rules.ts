/**
 * security/rules.ts — Security scanning rules
 * Pattern-based detection for common AI agent threats
 * Pattern-based detection
 */
import type { SecurityRule } from './types.js';

export const SECURITY_RULES: SecurityRule[] = [
  // === Prompt Injection ===
  {
    id: 'SEC-001',
    name: 'System Prompt Leakage',
    category: 'prompt-injection',
    severity: 'high',
    pattern: /ignore\s+(?:your?|the)\s+(?:previous|above|system|instruction)/gi,
    description: 'Attempt to override or ignore system instructions',
    remediation: 'Validate user input and sanitize prompts',
  },
  {
    id: 'SEC-002',
    name: 'Jailbreak Pattern',
    category: 'prompt-injection',
    severity: 'critical',
    pattern: /DAN\s*mode|jailbreak|ignore\s*all\s*rules|do\s*anything\s*now/gi,
    description: 'Known jailbreak attempt pattern detected',
    remediation: 'Block known jailbreak patterns in input validation',
  },
  {
    id: 'SEC-003',
    name: 'Role Play Manipulation',
    category: 'prompt-injection',
    severity: 'high',
    pattern: /act\s+as\s+(?:if\s+)?you\s+(?:are|were|have\s+no)/gi,
    description: 'Role play manipulation to bypass safety',
    remediation: 'Maintain consistent system role enforcement',
  },
  
  // === Data Exfiltration ===
  {
    id: 'SEC-004',
    name: 'URL Exfiltration',
    category: 'data-exfiltration',
    severity: 'critical',
    pattern: /https?:\/\/[^\s"]+\?(?:data|secret|key|token|password|env)=/gi,
    description: 'Potential data exfiltration via URL parameters',
    remediation: 'Validate all external URLs and sanitize parameters',
  },
  {
    id: 'SEC-005',
    name: 'DNS Exfiltration',
    category: 'data-exfiltration',
    severity: 'high',
    pattern: /(?:nslookup|dig|host)\s+.*\.(?:[a-z0-9-]+\.){2,}[a-z]{2,}/gi,
    description: 'Potential DNS-based data exfiltration',
    remediation: 'Restrict DNS queries and monitor for suspicious patterns',
  },
  {
    id: 'SEC-006',
    name: 'Clipboard Access',
    category: 'data-exfiltration',
    severity: 'medium',
    pattern: /clipboard|navigator\.clipboard|copy\s*\(/gi,
    description: 'Clipboard access may leak sensitive data',
    remediation: 'Review clipboard operations and implement access controls',
  },
  
  // === Command Injection ===
  {
    id: 'SEC-007',
    name: 'Shell Command Injection',
    category: 'command-injection',
    severity: 'critical',
    pattern: /exec(?:Sync)?\s*\(\s*["'][^"']*\+|child_process|spawn.*\+/gi,
    description: 'Potential shell command injection via concatenation',
    remediation: 'Use parameterized commands, never interpolate user input',
  },
  {
    id: 'SEC-008',
    name: 'Eval/Function Constructor',
    category: 'command-injection',
    severity: 'high',
    pattern: /eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["']|setInterval\s*\(\s*["']/gi,
    description: 'Dynamic code execution with potential injection',
    remediation: 'Avoid eval() and Function constructor with user input',
  },
  {
    id: 'SEC-009',
    name: 'Unsafe Shell Concatenation',
    category: 'command-injection',
    severity: 'critical',
    pattern: /exec(?:Sync|Async)?\s*\(\s*["'][^"']*\+\s*/gi,
    description: 'Unsafe shell command concatenation',
    remediation: 'Use spawn with array args, never string concatenation',
  },
  
  // === Malicious Code ===
  {
    id: 'SEC-010',
    name: 'Obfuscated JavaScript',
    category: 'malicious-code',
    severity: 'high',
    pattern: /\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|String\.fromCharCode|atob\s*\(|eval\s*\(|Function\s*\(/gi,
    description: 'Potentially obfuscated or encoded JavaScript',
    remediation: 'Review decoded content before execution',
  },
  {
    id: 'SEC-011',
    name: 'Suspicious Network Request',
    category: 'malicious-code',
    severity: 'high',
    pattern: /fetch\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/gi,
    description: 'External network request detected',
    remediation: 'Validate destination URLs against allowlist',
  },
  {
    id: 'SEC-012',
    name: 'File System Access',
    category: 'malicious-code',
    severity: 'medium',
    pattern: /fs\.[a-z]+\s*\(|require\s*\(\s*["']fs["']\s*\)|readFile|writeFile/gi,
    description: 'File system access may expose sensitive files',
    remediation: 'Restrict file access to allowed directories only',
  },
  
  // === Supply Chain ===
  {
    id: 'SEC-013',
    name: 'Suspicious Package Install',
    category: 'supply-chain',
    severity: 'high',
    pattern: /npm\s+install\s+(?:-[g]|--global)?\s+([a-z0-9-]*(?:typosquat|malicious|test))/gi,
    description: 'Potentially malicious package installation',
    remediation: 'Verify package names and sources before installation',
  },
  {
    id: 'SEC-014',
    name: 'Typosquatting Pattern',
    category: 'supply-chain',
    severity: 'medium',
    pattern: /(?:axios|lodash|express|react|vue|angular)[a-z0-9]{1,3}(?!\.[a-z])/gi,
    description: 'Possible typosquatting attack (popular package name + extra chars)',
    remediation: 'Verify package is the official one from trusted registry',
  },
  {
    id: 'SEC-015',
    name: 'Unverified External Script',
    category: 'supply-chain',
    severity: 'high',
    pattern: /curl.*\|\s*(?:bash|sh|zsh)|wget.*-O-\s*\|\s*(?:bash|sh|zsh)/gi,
    description: 'Downloading and executing unverified scripts',
    remediation: 'Never pipe remote content directly to shell',
  },
  {
    id: 'SEC-016',
    name: 'Dependency Confusion',
    category: 'supply-chain',
    severity: 'critical',
    pattern: /(?:npm|pip|gem)\s+(?:install|add)\s+@(?:company|internal|private)/gi,
    description: 'Potential dependency confusion attack',
    remediation: 'Use scoped packages and verify package ownership',
  },
  
  // === Secrets ===
  {
    id: 'SEC-017',
    name: 'Hardcoded API Key',
    category: 'secrets',
    severity: 'critical',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/gi,
    description: 'Hardcoded API key detected',
    remediation: 'Use environment variables or secret management',
  },
  {
    id: 'SEC-018',
    name: 'Hardcoded Password',
    category: 'secrets',
    severity: 'critical',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/gi,
    description: 'Hardcoded password detected',
    remediation: 'Use environment variables or secret management',
  },
  {
    id: 'SEC-019',
    name: 'AWS Access Key',
    category: 'secrets',
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS Access Key ID detected',
    remediation: 'Rotate credentials and use IAM roles',
  },
  {
    id: 'SEC-020',
    name: 'Private Key',
    category: 'secrets',
    severity: 'critical',
    pattern: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
    description: 'Private key detected in code',
    remediation: 'Remove from repository and rotate credentials',
  },
];

// Category descriptions
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'prompt-injection': 'Attempts to manipulate AI behavior through crafted inputs',
  'data-exfiltration': 'Techniques to leak sensitive data to external destinations',
  'command-injection': 'Unsafe execution of system commands with user input',
  'malicious-code': 'Potentially harmful or obfuscated code patterns',
  'supply-chain': 'Attacks targeting dependencies and package managers',
  'secrets': 'Exposed credentials, tokens, or sensitive data',
  'vulnerability': 'Known security vulnerabilities in dependencies',
};

/**
 * Scan text for security threats based on patterns
 */
export function scanForThreats(content: string): SecurityRule[] {
  const threats: SecurityRule[] = [];
  for (const rule of SECURITY_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(content)) {
      threats.push(rule);
    }
  }
  return threats;
}
