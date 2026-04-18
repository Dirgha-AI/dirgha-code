/** tools/browser.test.ts — Tests for browser tool (agent-browser integration) */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { browserTool } from './browser.js';
import * as utils from './browser/utils.js';
import * as agent from './browser/agent.js';

describe('browserTool', () => {
  beforeEach(() => {
    vi.spyOn(utils, 'isAgentBrowserInstalled').mockReturnValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('validation', () => {
    it('navigate requires url', () => {
      expect(browserTool({ action: 'navigate' }).error).toContain('url required');
    });

    it('click requires selector', () => {
      expect(browserTool({ action: 'click' }).error).toContain('selector required');
    });

    it('type requires both fields', () => {
      expect(browserTool({ action: 'type', selector: '@e1' }).error).toContain('required');
      expect(browserTool({ action: 'type', text: 'hi' }).error).toContain('required');
    });

    it('fill requires both fields', () => {
      expect(browserTool({ action: 'fill', selector: '@e1' }).error).toContain('required');
      expect(browserTool({ action: 'fill', text: 'hi' }).error).toContain('required');
    });

    it('find requires role', () => {
      expect(browserTool({ action: 'find' }).error).toContain('role required');
    });

    it('get requires info', () => {
      expect(browserTool({ action: 'get' }).error).toContain('info required');
    });

    it('eval requires js', () => {
      expect(browserTool({ action: 'eval' }).error).toContain('js required');
    });

    it('batch requires commands', () => {
      expect(browserTool({ action: 'batch' }).error).toContain('commands array required');
    });
  });

  describe('agent delegation', () => {
    beforeEach(() => {
      vi.spyOn(agent, 'navigateAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'snapshotAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'clickAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'typeAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'fillAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'screenshotAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'findAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'getAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'evalAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
      vi.spyOn(agent, 'batchAgent').mockReturnValue({ tool: 'browser', result: 'ok' });
    });

    it('delegates navigate to agent', () => {
      browserTool({ action: 'navigate', url: 'https://example.com' });
      expect(agent.navigateAgent).toHaveBeenCalledWith('https://example.com');
    });

    it('delegates snapshot with options', () => {
      browserTool({ action: 'snapshot', interactive: true, compact: true, depth: 3 });
      expect(agent.snapshotAgent).toHaveBeenCalledWith(expect.objectContaining({ interactive: true, compact: true, depth: 3 }));
    });

    it('delegates click to agent', () => {
      browserTool({ action: 'click', selector: '@e1' });
      expect(agent.clickAgent).toHaveBeenCalledWith('@e1');
    });

    it('delegates type to agent', () => {
      browserTool({ action: 'type', selector: '@e2', text: 'hello' });
      expect(agent.typeAgent).toHaveBeenCalledWith('@e2', 'hello');
    });

    it('delegates fill to agent', () => {
      browserTool({ action: 'fill', selector: '@e3', text: 'pass' });
      expect(agent.fillAgent).toHaveBeenCalledWith('@e3', 'pass');
    });

    it('delegates screenshot to agent', () => {
      browserTool({ action: 'screenshot', path: '/tmp/shot.png', annotate: true });
      expect(agent.screenshotAgent).toHaveBeenCalledWith('/tmp/shot.png', true);
    });

    it('delegates find to agent', () => {
      browserTool({ action: 'find', role: 'button', findAction: 'click', name: 'Submit' });
      expect(agent.findAgent).toHaveBeenCalledWith('button', 'click', 'Submit');
    });

    it('delegates get to agent', () => {
      browserTool({ action: 'get', info: 'title', selector: 'h1' });
      expect(agent.getAgent).toHaveBeenCalledWith('title', 'h1');
    });

    it('delegates eval to agent', () => {
      browserTool({ action: 'eval', js: 'document.title' });
      expect(agent.evalAgent).toHaveBeenCalledWith('document.title');
    });

    it('delegates batch to agent', () => {
      const cmds = [['open', 'example.com'], ['click', '@e1']];
      browserTool({ action: 'batch', commands: cmds });
      expect(agent.batchAgent).toHaveBeenCalledWith(cmds);
    });
  });

  describe('legacy fallback', () => {
    beforeEach(() => {
      vi.spyOn(utils, 'isAgentBrowserInstalled').mockReturnValue(false);
    });

    it('uses legacy navigate', { timeout: 30000 }, () => {
      const r = browserTool({ action: 'navigate', url: 'https://example.com' });
      expect(r.result).toContain('Fallback');
    });

    it('returns error for screenshot without agent-browser', () => {
      const r = browserTool({ action: 'screenshot', url: 'https://example.com' });
      expect(r.error).toContain('agent-browser');
    });
  });

  describe('unknown action', () => {
    it('returns error for unknown action', () => {
      const r = browserTool({ action: 'unknown' });
      expect(r.error).toContain('Unknown action');
    });
  });
});
