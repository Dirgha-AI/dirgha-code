import { useState, useEffect, useRef, useCallback } from "react"
import type { EventStream } from "../../kernel/event-stream.js"

export interface ActiveTool {
  id: string
  name: string
  elapsedMs: number
}

/**
 * Tracks active tool executions via the event stream.
 *
 * Uses the same single-global-interval pattern as `use-elapsed.ts` so that
 * all StatusBar consumers tick together instead of each running their own
 * timer. The interval starts only when tools are active and stops when the
 * set empties — idle terminals no longer re-render every second.
 */

let _tick = 0
let _interval: ReturnType<typeof setInterval> | null = null
const _listeners = new Set<() => void>()

function ensureTick(): void {
  if (_interval !== null) return
  _interval = setInterval(() => {
    _tick++
    for (const fn of _listeners) fn()
  }, 1000)
}

function stopTick(): void {
  if (_interval !== null) {
    clearInterval(_interval)
    _interval = null
  }
}

export function useToolProgress(events: EventStream): ActiveTool[] {
  const [tools, setTools] = useState<ActiveTool[]>([])

  const activeRef = useRef<Map<string, { name: string; startedAt: number }>>(
    new Map()
  )

  // Stable compute function so the interval callback doesn't close over stale state.
  const emitTools = useCallback(() => {
    if (activeRef.current.size === 0) {
      setTools((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const now = Date.now()
    const entries: { id: string; name: string; elapsedMs: number; startedAt: number }[] = []

    for (const [id, { name, startedAt }] of activeRef.current.entries()) {
      entries.push({ id, name, elapsedMs: now - startedAt, startedAt })
    }

    entries.sort((a, b) => a.startedAt - b.startedAt)
    setTools(entries.map(({ id, name, elapsedMs }) => ({ id, name, elapsedMs })))
  }, [])

  // Subscribe to the event stream — start/stop the global tick based on tool count.
  useEffect(() => {
    activeRef.current.clear()

    const unsubscribe = events.subscribe((event) => {
      if (event.type === "tool_exec_start") {
        const { id, name } = event as { id: string; name: string }
        activeRef.current.set(id, { name, startedAt: Date.now() })
        ensureTick()
      } else if (event.type === "tool_exec_end") {
        const { id } = event as { id: string }
        activeRef.current.delete(id)
        if (activeRef.current.size === 0) stopTick()
      }
    })
    return () => {
      unsubscribe()
      stopTick()
    }
  }, [events])

  // Register/unregister a per-instance tick listener. The global tick runs
  // only while there are listeners → idle components add zero overhead.
  useEffect(() => {
    ensureTick()
    _listeners.add(emitTools)
    return () => {
      _listeners.delete(emitTools)
      if (_listeners.size === 0) stopTick()
    }
  }, [emitTools])

  return tools
}

// Test-only accessor for the integration test suite.
export function _toolProgressListenerCountForTests(): number {
  return _listeners.size
}
