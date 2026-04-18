/**
 * rivet/multiplayer.ts — Real-time team collaboration and observation
 * 
 * Features:
 * - Team debugging: Multiple agents observe same session
 * - Pair programming: Collaborative editing
 * - Session sharing: Live stream to observers
 * - Presence awareness: Who's watching/working
 * 
 * Phase C: Collaboration (Rivet Agent-OS)
 */

import { EventEmitter } from 'node:events';
import type { Transcript, TranscriptEvent } from './transcript.js';

/** Participant role */
export type ParticipantRole = 'owner' | 'editor' | 'observer';

/** Session participant */
export interface Participant {
  /** Unique participant ID */
  id: string;
  /** Display name */
  name: string;
  /** Participant role */
  role: ParticipantRole;
  /** Connection status */
  status: 'connected' | 'disconnected' | 'idle';
  /** When they joined */
  joinedAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
  /** Cursor position (for collaborative editing) */
  cursor?: {
    file?: string;
    line?: number;
    column?: number;
  };
  /** Current focus */
  focus?: 'chat' | 'code' | 'terminal' | 'browser';
}

/** Multiplayer session */
export interface MultiplayerSession {
  /** Session ID */
  id: string;
  /** Session owner */
  ownerId: string;
  /** All participants */
  participants: Map<string, Participant>;
  /** Is session live/streaming */
  isLive: boolean;
  /** Session visibility */
  visibility: 'private' | 'team' | 'public';
  /** Active file being edited collaboratively */
  activeFile?: string;
  /** Shared state */
  sharedState: Map<string, unknown>;
  /** Session transcript */
  transcript: Transcript;
}

/** Multiplayer event types */
export type MultiplayerEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'cursor_moved'
  | 'focus_changed'
  | 'message_typing'
  | 'message_sent'
  | 'file_opened'
  | 'file_edited'
  | 'command_shared'
  | 'session_ended';

/** Multiplayer event */
export interface MultiplayerEvent {
  type: MultiplayerEventType;
  participantId: string;
  timestamp: string;
  data: unknown;
}

/** Multiplayer manager for team collaboration */
export class MultiplayerManager extends EventEmitter {
  private sessions = new Map<string, MultiplayerSession>();
  private localParticipantId: string;

  constructor() {
    super();
    this.localParticipantId = this.generateId();
  }

  /** Create a new multiplayer session */
  createSession(
    sessionId: string,
    options: {
      visibility?: MultiplayerSession['visibility'];
      transcript: Transcript;
    }
  ): MultiplayerSession {
    const session: MultiplayerSession = {
      id: sessionId,
      ownerId: this.localParticipantId,
      participants: new Map(),
      isLive: true,
      visibility: options.visibility || 'private',
      sharedState: new Map(),
      transcript: options.transcript,
    };

    // Add owner as first participant
    const owner: Participant = {
      id: this.localParticipantId,
      name: 'You',
      role: 'owner',
      status: 'connected',
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      focus: 'chat',
    };
    session.participants.set(owner.id, owner);

    this.sessions.set(sessionId, session);
    this.emit('session_created', { sessionId, ownerId: owner.id });
    
    return session;
  }

  /** Join an existing session */
  joinSession(
    sessionId: string,
    participantInfo: {
      name: string;
      role?: ParticipantRole;
    }
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Check visibility permissions
    if (session.visibility === 'private' && participantInfo.role !== 'owner') {
      return false;
    }

    const participant: Participant = {
      id: this.generateId(),
      name: participantInfo.name,
      role: participantInfo.role || 'observer',
      status: 'connected',
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    session.participants.set(participant.id, participant);
    
    this.emit('participant_joined', {
      sessionId,
      participantId: participant.id,
      participant,
    });

    return true;
  }

  /** Leave a session */
  leaveSession(sessionId: string, participantId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const id = participantId || this.localParticipantId;
    const participant = session.participants.get(id);
    
    if (!participant) {
      return false;
    }

    participant.status = 'disconnected';
    session.participants.delete(id);

    this.emit('participant_left', {
      sessionId,
      participantId: id,
      participant,
    });

    // End session if owner leaves
    if (id === session.ownerId) {
      this.endSession(sessionId);
    }

    return true;
  }

  /** Update cursor position (for collaborative editing awareness) */
  updateCursor(
    sessionId: string,
    cursor: Participant['cursor']
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(this.localParticipantId);
    if (!participant) return;

    participant.cursor = cursor;
    participant.lastActivityAt = new Date().toISOString();

    this.emit('cursor_moved', {
      sessionId,
      participantId: participant.id,
      cursor,
    });
  }

  /** Update focus (what the participant is looking at) */
  updateFocus(
    sessionId: string,
    focus: Participant['focus']
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(this.localParticipantId);
    if (!participant) return;

    participant.focus = focus;
    participant.lastActivityAt = new Date().toISOString();

    this.emit('focus_changed', {
      sessionId,
      participantId: participant.id,
      focus,
    });
  }

  /** Share a file with all participants */
  shareFile(
    sessionId: string,
    filepath: string,
    content?: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.activeFile = filepath;
    
    this.emit('file_shared', {
      sessionId,
      filepath,
      content,
      sharedBy: this.localParticipantId,
    });
  }

  /** Share a terminal command with observers */
  shareCommand(
    sessionId: string,
    command: string,
    output?: string
  ): void {
    this.emit('command_shared', {
      sessionId,
      command,
      output,
      sharedBy: this.localParticipantId,
      timestamp: new Date().toISOString(),
    });
  }

  /** Send a typing indicator */
  sendTypingIndicator(sessionId: string, isTyping: boolean): void {
    this.emit('typing_indicator', {
      sessionId,
      participantId: this.localParticipantId,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get all participants in a session */
  getParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values());
  }

  /** Get session info */
  getSession(sessionId: string): MultiplayerSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get all active sessions */
  getActiveSessions(): MultiplayerSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isLive);
  }

  /** End a session */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isLive = false;
    
    this.emit('session_ended', {
      sessionId,
      endedBy: this.localParticipantId,
      timestamp: new Date().toISOString(),
    });

    this.sessions.delete(sessionId);
    return true;
  }

  /** Set shared state value */
  setSharedState(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedState.set(key, value);
    
    this.emit('state_changed', {
      sessionId,
      key,
      value,
      changedBy: this.localParticipantId,
    });
  }

  /** Get shared state value */
  getSharedState(sessionId: string, key: string): unknown | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return session.sharedState.get(key);
  }

  /** Subscribe to transcript updates */
  subscribeToTranscript(
    sessionId: string,
    callback: (event: TranscriptEvent) => void
  ): () => void {
    const handler = (data: { sessionId: string; event: TranscriptEvent }) => {
      if (data.sessionId === sessionId) {
        callback(data.event);
      }
    };

    this.on('transcript_event', handler);
    
    // Return unsubscribe function
    return () => this.off('transcript_event', handler);
  }

  /** Broadcast transcript event to all observers */
  broadcastTranscriptEvent(sessionId: string, event: TranscriptEvent): void {
    this.emit('transcript_event', { sessionId, event });
  }

  /** Check if local user is in a session */
  isInSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.participants.has(this.localParticipantId);
  }

  /** Get local participant ID */
  getLocalId(): string {
    return this.localParticipantId;
  }

  private generateId(): string {
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** Create a team session for debugging */
export function createTeamSession(
  manager: MultiplayerManager,
  options: {
    name: string;
    visibility?: 'team' | 'private';
    transcript: Transcript;
  }
): MultiplayerSession {
  const sessionId = `team_${Date.now()}`;
  const session = manager.createSession(sessionId, {
    visibility: options.visibility || 'team',
    transcript: options.transcript,
  });

  // Set team name in shared state
  manager.setSharedState(sessionId, 'team_name', options.name);
  manager.setSharedState(sessionId, 'purpose', 'team_debugging');

  return session;
}

/** Create a pair programming session */
export function createPairSession(
  manager: MultiplayerManager,
  partnerName: string,
  transcript: Transcript
): { session: MultiplayerSession; inviteCode: string } {
  const sessionId = `pair_${Date.now()}`;
  const session = manager.createSession(sessionId, {
    visibility: 'private',
    transcript,
  });

  // Generate invite code
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  manager.setSharedState(sessionId, 'invite_code', inviteCode);
  manager.setSharedState(sessionId, 'partner_name', partnerName);
  manager.setSharedState(sessionId, 'purpose', 'pair_programming');

  return { session, inviteCode };
}

/** Render session as text for terminal display */
export function renderSessionStatus(session: MultiplayerSession): string {
  const lines: string[] = [
    `📡 Session: ${session.id}`,
    `   Status: ${session.isLive ? '🟢 Live' : '🔴 Ended'}`,
    `   Visibility: ${session.visibility}`,
    `   Participants (${session.participants.size}):`,
  ];

  for (const [id, p] of session.participants) {
    const status = p.status === 'connected' ? '🟢' : '⚪';
    const role = p.role === 'owner' ? '👑' : p.role === 'editor' ? '✏️' : '👁';
    const focus = p.focus ? ` [${p.focus}]` : '';
    lines.push(`   ${status} ${role} ${p.name}${focus}`);
  }

  if (session.activeFile) {
    lines.push(`   📄 Active: ${session.activeFile}`);
  }

  return lines.join('\n');
}
