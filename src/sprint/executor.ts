import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import chalk from 'chalk';
import type { SprintManifest, SprintTask, TaskStateRow } from './types.js';
import { SprintJournal } from './journal.js';
import { verify } from './verifier.js';
import { compress, buildSprintContext, shouldCompress } from './compressor.js';
import { checkEscalation, sendNotification } from './escalation.js';
import { writeHeartbeat } from './watchdog.js';
import { runAgentLoop } from '../agent/loop.js';


export interface ExecutorOptions {
  dryRun?: boolean;
  verbose?: boolean;
  maxTurns?: number;
  signal?: AbortSignal;
}

export async function runSprint(
  manifest: SprintManifest,
  journal: SprintJournal,
  options?: ExecutorOptions
): Promise<void> {
  // 1. Sprint started event
  journal.addEvent({ sprintId: manifest.id, type: 'sprint_started', payload: { goal: manifest.goal } });

  // 2. Start heartbeat interval
  const heartbeatInterval = setInterval(() => writeHeartbeat(manifest.id), 30000);

  // 3. Track metrics
  let totalCostUsd = 0;
  const sprintStartedAt = new Date().toISOString();

  // 4. AbortController for graceful shutdown
  const abortController = new AbortController();
  const handleSignal = () => {
    console.log(chalk.yellow('\nReceived shutdown signal, gracefully stopping...'));
    abortController.abort();
  };
  process.on('SIGTERM', handleSignal);
  process.on('SIGINT', handleSignal);

  try {
    // OUTER LOOP
    while (true) {
      if (abortController.signal.aborted) {
        break;
      }

      // a. Load all states
      const allStates = journal.getAllTaskStates();

      // b. Find ready tasks: pending where ALL deps completed
      const readyTasks = allStates
        .filter(s => s.status === 'pending')
        .map(s => {
          const task = manifest.tasks.find(t => t.id === s.taskId);
          if (!task) return null;
          const depsCompleted = (task.dependsOn || []).every(depId => {
            const depState = allStates.find(st => st.taskId === depId);
            return depState?.status === 'completed';
          });
          return depsCompleted ? task : null;
        })
        .filter((t): t is SprintTask => t !== null);

      // c. Find running tasks
      const runningTasks = allStates.filter(s => s.status === 'running');

      // d. Find completed tasks
      const completedTasks = allStates.filter(s => s.status === 'completed');

      // e. If no ready AND no running
      if (readyTasks.length === 0 && runningTasks.length === 0) {
        const allDone = allStates.every(s => s.status === 'completed' || s.status === 'skipped');
        if (allDone) {
          journal.setSprintStatus(manifest.id, 'completed');
          journal.addEvent({ sprintId: manifest.id, type: 'sprint_completed', payload: { totalCostUsd } });
          break;
        } else {
          // Deadlock detected
          journal.setSprintStatus(manifest.id, 'paused');
          sendNotification(manifest.id, 'Sprint deadlock detected - manual intervention required');
          break;
        }
      }

      // f. If no ready but running exist, wait
      if (readyTasks.length === 0 && runningTasks.length > 0) {
        await sleep(10000);
        continue;
      }

      // g. Check escalation
      const escalation = checkEscalation(manifest, allStates, sprintStartedAt, totalCostUsd);
      if (escalation.shouldEscalate) {
        journal.setSprintStatus(manifest.id, 'paused');
        sendNotification(manifest.id, `Sprint escalated: ${escalation.reason}`);
        break;
      }

      // h. Dispatch up to maxParallel tasks
      const availableSlots = manifest.maxParallel - runningTasks.length;
      const tasksToRun = readyTasks.slice(0, Math.max(0, availableSlots));
      
      if (tasksToRun.length > 0) {
        const results = await Promise.all(
          tasksToRun.map(task => 
            runTask(manifest, task, journal, completedTasks, { 
              ...options, 
              signal: abortController.signal 
            })
          )
        );
        totalCostUsd += results.reduce((sum, r) => sum + r.costUsd, 0);
      }

      // i. Write heartbeat
      writeHeartbeat(manifest.id);
    }
  } finally {
    // 5. Mark sprint complete/aborted if not already set
    const currentStatus = journal.getSprintStatus(manifest.id);
    if (currentStatus !== 'completed' && currentStatus !== 'paused' && currentStatus !== 'aborted') {
      if (abortController.signal.aborted) {
        journal.setSprintStatus(manifest.id, 'aborted');
        journal.addEvent({ sprintId: manifest.id, type: 'sprint_aborted', payload: { reason: 'signal' } });
      }
    }

    // 6. Clear heartbeat interval
    clearInterval(heartbeatInterval);

    // 7. Send WhatsApp notification on complete
    if (manifest.notify?.onComplete && journal.getSprintStatus(manifest.id) === 'completed') {
      sendNotification(manifest.id, `Sprint ${manifest.id} completed successfully`);
    }

    // Cleanup signal handlers
    process.off('SIGTERM', handleSignal);
    process.off('SIGINT', handleSignal);
  }
}

export async function runTask(
  manifest: SprintManifest,
  task: SprintTask,
  journal: SprintJournal,
  completedTasks: TaskStateRow[],
  options?: ExecutorOptions
): Promise<{ costUsd: number }> {
  // 1. Set status running
  journal.setTaskStatus(task.id, 'running');
  
  // 2. Increment attempts
  journal.incrementAttempts(task.id);
  
  // 3. Add event
  journal.addEvent({ sprintId: manifest.id, type: 'task_started', taskId: task.id });

  // 4. Build prompt
  const context = buildSprintContext(manifest, completedTasks);
  const prompt = `${context}\n\n## Your Task\n${task.title}\n\n${task.prompt}`;

  // 5. Fresh messages
  let messages: any[] = [];
  let totalCost = 0;
  let agentOutput = '';

  // 7. Run agent loop
  const result = await runAgentLoop(
    prompt,
    messages,
    manifest.model,
    (t) => {
      if (options?.verbose) {
        process.stdout.write(t);
      }
      agentOutput += t;
      // Keep last 200 chars
      if (agentOutput.length > 200) {
        agentOutput = agentOutput.slice(-200);
      }
    },
    (name, input) => {
      if (options?.verbose) {
        console.log('[tool]', name);
      }
    },
    undefined, // ctx
    undefined, // skillOverride
    {
      maxTurns: options?.maxTurns ?? 50,
      signal: options?.signal
    }
  );
  
  totalCost += result.costUsd;
  messages = result.messages;

  // NOTE: Each task runs with a fresh message array (no cross-task shared context).
  // Compression is applied post-loop to the per-task messages so that if this task
  // is retried the retained context is compact and token-efficient.
  if (shouldCompress(messages)) {
    const beforeLength = messages.length;
    messages = compress(messages);
    journal.addEvent({
      sprintId: manifest.id,
      taskId: task.id,
      type: 'context_compressed',
      payload: { before: beforeLength, after: messages.length },
    });
  }

  // 8. Auto-commit
  let gitSha = '';
  try {
    execSync(`cd "${manifest.cwd}" && git add -A && git commit -m "feat(sprint): ${task.title} [${task.id}]"`, { 
      stdio: 'pipe' 
    });
  } catch (e) {
    // Commit might fail if no changes, continue
  }
  
  // Get git SHA
  try {
    gitSha = execSync('git rev-parse HEAD', { cwd: manifest.cwd, stdio: 'pipe' }).toString().trim();
  } catch (e) {
    // Ignore git errors
  }

  // 9. Run verification
  const results = await verify(task, manifest.cwd);
  const allPassed = results.every(r => r.passed);

  // 11. If all passed
  if (allPassed) {
    journal.setTaskStatus(task.id, 'completed', { gitSha, verifyLog: results, agentOutput });
    journal.addEvent({ sprintId: manifest.id, type: 'task_completed', taskId: task.id, payload: { gitSha } });
    if (manifest.notify?.onTaskDone) {
      sendNotification(manifest.id, task.id + ' complete');
    }
  } else {
    // 12. Handle failure
    const state = journal.getTaskState(task.id);
    const attempts = state?.attempts ?? task.maxRetries;
    
    if (attempts < task.maxRetries) {
      journal.setTaskStatus(task.id, 'pending', { verifyLog: results, errorLog: 'verification failed' });
      journal.addEvent({ sprintId: manifest.id, type: 'task_retrying', taskId: task.id, payload: { attempt: attempts } });
    } else {
      // Handle onFail strategy
      const strategy = task.onFail || 'pause';
      
      switch (strategy) {
        case 'retry':
          // Unlimited retry - set back to pending
          journal.setTaskStatus(task.id, 'pending', { verifyLog: results, errorLog: 'verification failed - unlimited retry' });
          journal.addEvent({ sprintId: manifest.id, type: 'task_retrying', taskId: task.id, payload: { attempt: attempts, unlimited: true } });
          break;
        case 'skip':
          journal.setTaskStatus(task.id, 'skipped');
          journal.addEvent({ sprintId: manifest.id, type: 'task_skipped', taskId: task.id, payload: { reason: 'max retries exceeded' } });
          break;
        case 'pause':
          journal.setSprintStatus(manifest.id, 'paused');
          journal.setTaskStatus(task.id, 'failed', { verifyLog: results, errorLog: 'verification failed', agentOutput });
          journal.addEvent({ sprintId: manifest.id, type: 'task_failed', taskId: task.id, payload: { reason: 'max retries exceeded', strategy: 'pause' } });
          break;
        case 'abort':
          journal.setSprintStatus(manifest.id, 'aborted');
          journal.setTaskStatus(task.id, 'failed', { verifyLog: results, errorLog: 'verification failed', agentOutput });
          journal.addEvent({ sprintId: manifest.id, type: 'task_failed', taskId: task.id, payload: { reason: 'max retries exceeded', strategy: 'abort' } });
          break;
        default:
          // Default to pause
          journal.setSprintStatus(manifest.id, 'paused');
          journal.setTaskStatus(task.id, 'failed', { verifyLog: results, errorLog: 'verification failed', agentOutput });
      }
    }
  }

  return { costUsd: totalCost };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
