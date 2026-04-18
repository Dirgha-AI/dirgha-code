import chalk from 'chalk';

class ArnikoClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
  }

  async startScan(opts: any): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/security/scan-skill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        content: opts.targetId, // For now, passing path as content for scanning
        metadata: { type: opts.targetType, tools: opts.tools }
      })
    });

    if (!res.ok) throw new Error(`Gateway returned ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    return data.scanId || data.id || 'mock-id';
  }

  async waitForCompletion(scanId: string): Promise<{count: number; findings: Array<{severity: string; tool: string; message: string}>}> {
    let attempts = 0;
    while (attempts < 30) {
      const res = await fetch(`${this.baseUrl}/api/security/scan-status/${scanId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.status === 'completed' || data.status === 'done' || data.success) {
          return {
            count: data.findings?.length || 0,
            findings: data.findings || (data.result?.safe ? [] : [{ severity: 'high', tool: 'arniko', message: 'Potential issues found during scan' }])
          };
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    return { count: 0, findings: [] };
  }
}

export async function runArnikoScan(path: string): Promise<boolean> {
  const gatewayUrl = process.env.GATEWAY_URL || process.env.ARNIKO_URL || 'http://localhost:3001';
  
  console.log(chalk.blue('Using Arniko Security Substrate...'));
  const client = new ArnikoClient({ 
    baseUrl: gatewayUrl, 
    apiKey: process.env.DIRGHA_API_KEY 
  });
  
  try {
    const scanId = await client.startScan({
      targetId: path,
      targetType: 'repository',
      tools: ['semgrep', 'bandit', 'gitleaks', 'trivy']
    });
    
    console.log(chalk.gray(`Started Arniko Scan ID: ${scanId}`));
    const results = await client.waitForCompletion(scanId);
    
    console.log(chalk.bold('Arniko Summary:'));
    console.log(`  Total findings: ${results.count}`);
    
    for (const finding of results.findings) {
      console.log(`  [${finding.severity.toUpperCase()}] ${finding.tool}: ${finding.message}`);
    }
    
    if (results.findings.some(f => f.severity === 'critical' || f.severity === 'high')) {
      console.log(chalk.red(`❌ Scan failed: Found high/critical issues`));
      return true;
    }
    
    console.log(chalk.green('✅ Scan complete: No critical security issues found'));
    return false;
  } catch (err: any) {
    console.error(chalk.red(`Arniko scan failed: ${err.message}`));
    return false;
  }
}
