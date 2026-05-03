/**
 * Render performance metrics hook.
 *
 * Tracks per-frame timing, computes session aggregates (avg / p99),
 * and persists cumulative totals to ~/.dirgha/state.json so long-running
 * sessions can track performance trends.
 */
import * as React from "react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const STATE_PATH = join(homedir(), ".dirgha", "state.json");
const MAX_FRAME_TIMES = 1000;
async function readState() {
    try {
        const raw = await readFile(STATE_PATH, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function writeState(state) {
    try {
        await mkdir(join(homedir(), ".dirgha"), { recursive: true });
        await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    }
    catch {
        /* best-effort */
    }
}
export function useRenderMetrics() {
    const lastFrameRef = React.useRef(Date.now());
    const frameTimesRef = React.useRef([]);
    const totalFrameTimeRef = React.useRef(0);
    const framesThisSessionRef = React.useRef(0);
    const now = Date.now();
    const frameTime = now - lastFrameRef.current;
    lastFrameRef.current = now;
    if (framesThisSessionRef.current > 0) {
        frameTimesRef.current.push(frameTime);
        totalFrameTimeRef.current += frameTime;
    }
    framesThisSessionRef.current++;
    if (frameTimesRef.current.length > MAX_FRAME_TIMES) {
        const removed = frameTimesRef.current.shift();
        totalFrameTimeRef.current -= removed;
    }
    React.useEffect(() => {
        // Capture frameTime and frameTimesRef at mount time, then write
        // once per render to state so the I/O doesn't repeat on re-renders
        // of the parent (which would fire hundreds/sec).
        const capturedFrameTime = frameTime;
        void (async () => {
            try {
                const state = await readState();
                const prev = state.renderMetrics ?? {
                    totalFrames: 0,
                    totalFrameTimeMs: 0,
                    p99History: [],
                };
                prev.totalFrames += 1;
                prev.totalFrameTimeMs += capturedFrameTime;
                if (frameTimesRef.current.length >= 100) {
                    const sorted = [...frameTimesRef.current].sort((a, b) => a - b);
                    const idx = Math.ceil(sorted.length * 0.99) - 1;
                    const p99 = sorted[idx] ?? 0;
                    prev.p99History.push(p99);
                    if (prev.p99History.length > 100)
                        prev.p99History = prev.p99History.slice(-100);
                }
                state.renderMetrics = prev;
                await writeState(state);
            }
            catch {
                /* best-effort */
            }
        })();
    }, []);
    return {
        framesThisSession: () => framesThisSessionRef.current,
        avgFrameTimeMs: () => {
            const n = frameTimesRef.current.length;
            return n > 0 ? Math.round((totalFrameTimeRef.current / n) * 10) / 10 : 0;
        },
        p99FrameTimeMs: () => {
            const times = [...frameTimesRef.current].sort((a, b) => a - b);
            const idx = Math.ceil(times.length * 0.99) - 1;
            return times[idx] ?? 0;
        },
        lastFrameTimeMs: () => {
            const times = frameTimesRef.current;
            return times.length > 0 ? times[times.length - 1] : 0;
        },
    };
}
//# sourceMappingURL=use-render-metrics.js.map