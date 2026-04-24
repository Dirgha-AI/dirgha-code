/** tools/browser.ts — Browser automation using agent-browser (Vercel Labs)
 * Sprint 14: Browser Tool Implementation
 * 
 * Requirements: npm install -g agent-browser && agent-browser install
 */
import type { ToolResult } from '../types.js';
import { isAgentBrowserInstalled, truncateOutput, MAX_OUTPUT } from './browser/utils.js';
import { navigateAgent, snapshotAgent, clickAgent, typeAgent, fillAgent, screenshotAgent, findAgent, getAgent, batchAgent, evalAgent } from './browser/agent.js';
import { navigateLegacy, extractLegacy, searchLegacy } from './browser/legacy.js';
import { visionAction } from './browser/vision.js';

export async function browserTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    const action = input['action'] as string;
    const hasAgentBrowser = isAgentBrowserInstalled();

    // Vision runs regardless of action-path — it needs only a screenshot
    // and a vision-capable LLM, which don't live under the agent-browser
    // safe set.
    if (action === 'vision') return visionAction(input);

    if (hasAgentBrowser) {
      switch (action) {
        case 'navigate': {
          const url = input['url'];
          if (!url) return { tool: 'browser', result: '', error: 'url required' };
          return navigateAgent(url);
        }
        case 'snapshot': return snapshotAgent(input);
        case 'click': {
          const sel = input['selector'];
          if (!sel) return { tool: 'browser', result: '', error: 'selector required' };
          return clickAgent(sel);
        }
        case 'type': {
          const sel = input['selector'], text = input['text'];
          if (!sel || !text) return { tool: 'browser', result: '', error: 'selector and text required' };
          return typeAgent(sel, text);
        }
        case 'fill': {
          const sel = input['selector'], text = input['text'];
          if (!sel || !text) return { tool: 'browser', result: '', error: 'selector and text required' };
          return fillAgent(sel, text);
        }
        case 'screenshot': return screenshotAgent(input['path'], input['annotate']);
        case 'find': {
          const role = input['role'];
          if (!role) return { tool: 'browser', result: '', error: 'role required' };
          return findAgent(role, input['findAction'], input['name']);
        }
        case 'get': {
          const info = input['info'];
          if (!info) return { tool: 'browser', result: '', error: 'info required (text|html|title|url)' };
          return getAgent(info, input['selector']);
        }
        case 'batch': {
          const cmds = input['commands'];
          if (!cmds) return { tool: 'browser', result: '', error: 'commands array required' };
          return batchAgent(cmds);
        }
        case 'eval': {
          const js = input['js'];
          if (!js) return { tool: 'browser', result: '', error: 'js required' };
          return evalAgent(js);
        }
      }
    }
    
    // Legacy fallback
    switch (action) {
      case 'navigate': {
        const url = input['url'];
        if (!url) return { tool: 'browser', result: '', error: 'url required' };
        return hasAgentBrowser ? navigateAgent(url) : navigateLegacy(url);
      }
      case 'screenshot': {
        if (hasAgentBrowser) return screenshotAgent(input['path'], input['annotate']);
        return { tool: 'browser', result: '', error: 'Install agent-browser: npm install -g agent-browser' };
      }
      case 'extract': {
        const url = input['url'], sel = input['selector'];
        if (!url) return { tool: 'browser', result: '', error: 'url required' };
        return extractLegacy(url, sel ?? 'text');
      }
      case 'search': {
        const q = input['query'];
        if (!q) return { tool: 'browser', result: '', error: 'query required' };
        return searchLegacy(q);
      }
      default: return { tool: 'browser', result: '', error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { tool: 'browser', result: '', error: (e as Error).message };
  }
}
