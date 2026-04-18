import type { SprintManifest, TaskStateRow } from './types.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function compress(messages: Message[]): Message[] {
  if (messages.length <= 10) {
    return messages;
  }

  const lastFive = messages.slice(-5);
  const toSummarize = messages.slice(0, -5);
  const turnCount = toSummarize.length;

  const fileChanges = extractFileChanges(toSummarize);
  
  const keyActions: string[] = [];
  for (const msg of toSummarize) {
    const content = msg.content;
    
    const patterns = [
      /(?:created?|wrote?|modified|updated?|deleted?|removed?|added)\s+(?:file\s+)?[`']?([^\s`']+\.(?:ts|tsx|js|py|md))[`']?/gi,
      /(?:running|executing|calling|invoking)\s+[`']?(\w+(?:\.\w+)*)[`']?/gi,
      /(?:npm|yarn|pnpm|pip|npx)\s+(?:install|run|exec|add|remove|test|build)/gi,
      /git\s+(?:commit|push|pull|checkout|branch|merge|status)/gi,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const action = match[0].trim();
        if (action && keyActions.length < 15 && !keyActions.includes(action)) {
          keyActions.push(action);
        }
      }
    }
  }

  const actionsStr = keyActions.length > 0 
    ? keyActions.slice(0, 10).join(', ') 
    : 'Various operations performed';

  const lastSummarized = toSummarize[toSummarize.length - 1];
  let currentState = 'Session in progress';
  
  if (lastSummarized) {
    const stateMatch = lastSummarized.content.match(/(?:status|state|progress|currently|now):\s*([^.]+)/i) ||
                      lastSummarized.content.match(/(?:completed|finished)\s+([^.]+)/i);
    if (stateMatch) {
      currentState = stateMatch[1].trim();
    } else if (lastSummarized.content.length > 0) {
      currentState = lastSummarized.content.substring(0, 100).replace(/\n/g, ' ') + '...';
    }
  }

  const filesStr = fileChanges.length > 0 
    ? fileChanges.join(', ') 
    : 'None detected';

  const summaryMessage: Message = {
    role: 'system',
    content: `[COMPRESSED HISTORY - ${turnCount} turns]
Key actions: ${actionsStr}
Files modified: ${filesStr}
Current state: ${currentState}`
  };

  return [summaryMessage, ...lastFive];
}

export function buildSprintContext(manifest: SprintManifest, completedTasks: TaskStateRow[]): string {
  const lines: string[] = [
    '## Sprint Context',
    `Goal: ${manifest.goal}`,
    `Sprint ID: ${manifest.id}`,
    '',
    '## Completed Tasks'
  ];
  
  if (completedTasks.length === 0) {
    lines.push('No tasks completed yet.');
  } else {
    for (const task of completedTasks) {
      const commit = task.gitSha || 'no commit';
      lines.push(`✓ ${task.taskId} (commit: ${commit})`);
    }
  }
  
  lines.push('');
  lines.push('## Working Directory');
  lines.push(manifest.cwd);
  
  return lines.join('\n');
}

export function shouldCompress(messages: Message[], threshold?: number): boolean {
  const limit = threshold ?? 15;
  return messages.length >= limit;
}

export function extractFileChanges(messages: Message[]): string[] {
  const fileSet = new Set<string>();
  const filePattern = /(?:^|\s|[`'"(\[])([^\s`'"(\]]+\.(?:ts|tsx|js|py|md))(?:\s|$|[`'")\]])/gi;
  
  for (const msg of messages) {
    const matches = msg.content.matchAll(filePattern);
    for (const match of matches) {
      const filePath = match[1];
      if (filePath && !filePath.includes('://')) {
        fileSet.add(filePath);
      }
    }
  }
  
  return Array.from(fileSet).sort();
}
