/**
 * FrameController.ts — 60fps frame rate controller using RAF
 */

import { FRAME_TIME } from './config.js';

export class FrameController {
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private pendingUpdate: (() => void) | null = null;
  private isActive = false;

  schedule(update: () => void): void {
    this.pendingUpdate = update;
    
    if (!this.isActive) {
      this.isActive = true;
      this.rafId = requestAnimationFrame((time) => this.onFrame(time));
    }
  }

  private onFrame(time: number): void {
    const elapsed = time - this.lastFrameTime;
    
    if (elapsed >= FRAME_TIME) {
      this.lastFrameTime = time;
      if (this.pendingUpdate) {
        this.pendingUpdate();
        this.pendingUpdate = null;
      }
    }
    
    if (this.pendingUpdate) {
      this.rafId = requestAnimationFrame((t) => this.onFrame(t));
    } else {
      this.isActive = false;
      this.rafId = null;
    }
  }

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isActive = false;
    this.pendingUpdate = null;
  }
}

export const globalFrameController = new FrameController();
