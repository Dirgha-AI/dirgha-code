/**
 * rivet/network-control.ts — Programmatic network access control
 * 
 * Fine-grained allow/deny/proxy for outbound connections.
 * Security: Deny-by-default with domain/URL patterns.
 * 
 * Phase A: Quick Win (Rivet Agent-OS integration)
 */

export type NetworkRuleAction = 'allow' | 'deny' | 'proxy';

export interface NetworkRule {
  /** Pattern to match (glob or regex) */
  pattern: string;
  /** Match type */
  type: 'domain' | 'url' | 'ip' | 'regex';
  /** Action to take */
  action: NetworkRuleAction;
  /** Optional proxy URL for 'proxy' action */
  proxyUrl?: string;
  /** Description for audit logs */
  description: string;
  /** Priority (higher = evaluated first) */
  priority: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface NetworkDecision {
  action: NetworkRuleAction;
  proxyUrl?: string;
  reason: string;
  matchedRule?: NetworkRule;
}

/** Network controller with rule-based access */
export class NetworkController {
  private rules: NetworkRule[] = [];
  private auditLog: Array<{
    timestamp: Date;
    url: string;
    decision: NetworkDecision;
    agentId?: string;
  }> = [];

  constructor(defaultRules?: NetworkRule[]) {
    if (defaultRules) {
      this.rules = [...defaultRules];
    } else {
      // Deny-by-default: block everything except localhost/essential APIs
      this.rules = [
        {
          pattern: 'localhost:*',
          type: 'domain',
          action: 'allow',
          description: 'Allow localhost connections',
          priority: 100,
        },
        {
          pattern: '127.0.0.1:*',
          type: 'ip',
          action: 'allow',
          description: 'Allow loopback connections',
          priority: 100,
        },
        {
          pattern: '*.openai.com',
          type: 'domain',
          action: 'allow',
          description: 'Allow OpenAI API',
          priority: 90,
        },
        {
          pattern: '*.anthropic.com',
          type: 'domain',
          action: 'allow',
          description: 'Allow Anthropic API',
          priority: 90,
        },
        {
          pattern: '*',
          type: 'domain',
          action: 'deny',
          description: 'Deny all other connections by default',
          priority: 0,
        },
      ];
    }
    // Sort by priority (descending)
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** Add a new network rule */
  addRule(rule: NetworkRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** Remove rules matching a pattern */
  removeRules(pattern: string): void {
    this.rules = this.rules.filter(r => r.pattern !== pattern);
  }

  /**
   * Evaluate a network request against rules
   * Returns decision and logs the attempt
   */
  evaluate(request: NetworkRequest, agentId?: string): NetworkDecision {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    for (const rule of this.rules) {
      const matches = this.matchesRule(hostname, pathname, request.url, rule);
      
      if (matches) {
        const decision: NetworkDecision = {
          action: rule.action,
          proxyUrl: rule.proxyUrl,
          reason: rule.description,
          matchedRule: rule,
        };

        this.auditLog.push({
          timestamp: new Date(),
          url: request.url,
          decision,
          agentId,
        });

        // Trim audit log if too large
        if (this.auditLog.length > 10000) {
          this.auditLog = this.auditLog.slice(-5000);
        }

        return decision;
      }
    }

    // Fallback: deny
    const fallbackDecision: NetworkDecision = {
      action: 'deny',
      reason: 'No matching rule (deny by default)',
    };

    this.auditLog.push({
      timestamp: new Date(),
      url: request.url,
      decision: fallbackDecision,
      agentId,
    });

    return fallbackDecision;
  }

  private matchesRule(
    hostname: string,
    pathname: string,
    fullUrl: string,
    rule: NetworkRule
  ): boolean {
    switch (rule.type) {
      case 'domain':
        return this.matchesDomain(hostname, rule.pattern);
      case 'url':
        return this.matchesPattern(fullUrl, rule.pattern);
      case 'ip':
        return this.matchesPattern(hostname, rule.pattern);
      case 'regex':
        return new RegExp(rule.pattern).test(fullUrl);
      default:
        return false;
    }
  }

  private matchesDomain(hostname: string, pattern: string): boolean {
    // Handle single wildcard (match any)
    if (pattern === '*') {
      return true;
    }
    // Handle wildcards like *.example.com
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return hostname === suffix || hostname.endsWith('.' + suffix);
    }
    // Handle port wildcards
    if (pattern.includes(':*')) {
      const [domain] = pattern.split(':');
      return hostname === domain;
    }
    return hostname === pattern;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    // Simple glob to regex conversion
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(value);
  }

  /** Get recent audit log entries */
  getAuditLog(since?: Date, agentId?: string): typeof this.auditLog {
    let filtered = this.auditLog;
    
    if (since) {
      filtered = filtered.filter(e => e.timestamp >= since);
    }
    
    if (agentId) {
      filtered = filtered.filter(e => e.agentId === agentId);
    }

    return filtered.slice(-1000); // Last 1000 entries
  }

  /** Export rules as JSON */
  exportRules(): NetworkRule[] {
    return [...this.rules];
  }

  /** Import rules from JSON */
  importRules(rules: NetworkRule[]): void {
    this.rules = [...rules];
    this.rules.sort((a, b) => b.priority - b.priority);
  }
}

/** Global network controller instance */
export const networkController = new NetworkController();

/** Check if a URL is allowed (helper) */
export function isUrlAllowed(url: string, method = 'GET'): boolean {
  const decision = networkController.evaluate({
    url,
    method,
    headers: {},
  });
  return decision.action === 'allow' || decision.action === 'proxy';
}

/** Create agent-specific network controller with custom rules */
export function createAgentNetworkController(
  agentId: string,
  customRules: NetworkRule[]
): NetworkController {
  return new NetworkController([
    ...customRules,
    {
      pattern: '*',
      type: 'domain',
      action: 'deny',
      description: `Deny all for agent ${agentId}`,
      priority: 0,
    },
  ]);
}
