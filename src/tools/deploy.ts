/**
 * tools/deploy.ts — Deployment trigger and status tools
 * Production-ready with real API integration
 */
import type { ToolResult } from '../types.js';
import { getDirghaToken } from '../utils/auth.js';

const DEPLOY_API = process.env.DIRGHA_DEPLOY_API ?? 'https://dirgha.app/api/deploy';

function getAuthHeaders(): Record<string, string> {
  const token = getDirghaToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

export async function deployTriggerTool(input: { 
  name: string; 
  repo?: string;
  branch?: string;
  envVars?: Record<string, string>;
}): Promise<ToolResult> {
  try {
    // First create project
    const createRes = await fetch(`${DEPLOY_API}/cli`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: input.name,
        repoUrl: input.repo,
        branch: input.branch ?? 'main',
        envVars: input.envVars ?? {},
      }),
    });

    if (!createRes.ok) {
      const error = await createRes.text();
      throw new Error(`Deploy failed: ${createRes.status} ${error}`);
    }

    const data = await createRes.json();
    return { 
      tool: 'deploy_trigger', 
      result: JSON.stringify({
        success: true,
        project: data.project,
        deployment: data.deployment,
        url: data.url,
        deploymentUrl: data.deploymentUrl,
        timestamp: new Date().toISOString(),
      })
    };
  } catch (e: any) {
    return { 
      tool: 'deploy_trigger', 
      result: JSON.stringify({ 
        success: false, 
        error: e.message,
        help: 'Ensure DIRGHA_TOKEN is set via `dirgha login`'
      }) 
    };
  }
}

export async function deployStatusTool(input: { projectId: string }): Promise<ToolResult> {
  try {
    const res = await fetch(`${DEPLOY_API}/projects/${input.projectId}`, {
      headers: getAuthHeaders(),
    });
    
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status}`);
    }
    
    const data = await res.json();
    return { tool: 'deploy_status', result: JSON.stringify(data) };
  } catch (e: any) {
    return { 
      tool: 'deploy_status', 
      result: JSON.stringify({ 
        error: e.message,
        help: 'Check project ID and authentication'
      }) 
    };
  }
}

export async function deployLogsTool(input: { deploymentId: string }): Promise<ToolResult> {
  try {
    const res = await fetch(`${DEPLOY_API}/deployments/${input.deploymentId}/logs`, {
      headers: getAuthHeaders(),
    });
    
    if (!res.ok) {
      throw new Error(`Logs fetch failed: ${res.status}`);
    }
    
    // Stream logs via EventSource in real implementation
    return { 
      tool: 'deploy_logs', 
      result: JSON.stringify({
        deploymentId: input.deploymentId,
        streamUrl: `${DEPLOY_API}/deployments/${input.deploymentId}/logs`,
        note: 'Use browser or curl to stream logs: curl -N ' + `${DEPLOY_API}/deployments/${input.deploymentId}/logs`
      }) 
    };
  } catch (e: any) {
    return { tool: 'deploy_logs', result: JSON.stringify({ error: e.message }) };
  }
}
