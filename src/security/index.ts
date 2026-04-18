/**
 * security/index.ts — Security scanner exports
 */
export { scanFile, scanDirectory, generateReport } from './scanner.js';
export { SECURITY_RULES, CATEGORY_DESCRIPTIONS } from './rules.js';
export type { 
  SecurityFinding, 
  ScanResult, 
  ScanOptions, 
  SecurityRule,
  Analyzer,
  Severity 
} from './types.js';
