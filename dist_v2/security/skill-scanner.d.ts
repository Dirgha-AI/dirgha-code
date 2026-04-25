/**
 * Skill prompt-injection / supply-chain scanner.
 *
 * Layer-1 of dirgha's skill defence: a heuristic scanner that runs
 * on every install AND every load. Catches the obvious red flags
 * before a third-party SKILL.md body is allowed into the system
 * prompt. No external deps; ships with the CLI.
 *
 * Layer-2 is the optional `@dirgha/arniko-plugin` extension that
 * augments this with Arniko's 36-scanner pipeline. When the plugin
 * is installed it runs after this scanner; when it isn't, the
 * heuristic alone is the defence.
 *
 * Initial implementation seeded by a hy3 dogfood run.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Verdict = 'allow' | 'warn' | 'block';
export interface Finding {
    severity: Severity;
    rule: string;
    snippet?: string;
    line?: number;
}
export interface ScanResult {
    verdict: Verdict;
    score: number;
    findings: Finding[];
}
export interface SkillMetaLike {
    name?: string;
    description?: string;
    triggers?: {
        keywords?: string[];
        filePatterns?: string[];
    };
}
/**
 * Scan a SKILL.md body + parsed frontmatter. Pass `meta` undefined to
 * skip frontmatter checks (useful when scanning raw bodies for snippet
 * extraction inside e.g. README content).
 */
export declare function scanSkillBody(body: string, meta?: SkillMetaLike): ScanResult;
export declare function summariseScan(scan: ScanResult): string;
