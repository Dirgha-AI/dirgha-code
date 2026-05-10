import React, { useState, useEffect, useRef } from "react"
import type { EventStream } from "../../kernel/event-stream.js"

export interface ActiveTool {
  id: string
  name: string
  elapsedMs: number
}

export function useToolProgress(events: EventStream): ActiveTool[] {
  const [tools, setTools] = useState<ActiveTool[]>([])

  // Map<id, { name, startedAt }>
  const activeRef = useRef<Map<string, { name: string; startedAt: number }>>(
    new Map()
  )

  // Subscribe to the event stream
  useEffect(() => {
    // Clear any stale tools from a previous subscription
    activeRef.current.clear()

    const unsubscribe = events.subscribe((event) => {
      // Narrow the event shape – the kernel guarantees these shapes.
      if (event.type === "tool_exec_start") {
        const { id, name } = event as { id: string; name: string }
        activeRef.current.set(id, { name, startedAt: Date.now() })
      } else if (event.type === "tool_exec_end") {
        const { id } = event as { id: string }
        activeRef.current.delete(id)
      }
    })
    return unsubscribe
  }, [events])

  // Update elapsed times every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const entries: { id: string; name: string; elapsedMs: number; startedAt: number }[] = []

      for (const [id, { name, startedAt }] of activeRef.current.entries()) {
        entries.push({ id, name, elapsedMs: now - startedAt, startedAt })
      }

      // Sort by startedAt ascending so the oldest running tool appears first
      entries.sort((a, b) => a.startedAt - b.startedAt)

      setTools(entries.map(({ id, name, elapsedMs }) => ({ id, name, elapsedMs })))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return tools
}
