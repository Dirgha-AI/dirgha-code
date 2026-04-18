/**
 * StreamContainer.tsx — Clean streaming layout
 * 
 * Structure:
 * 1. Thinking stream (plain italic text, outside boxes)
 * 2. Tool call boxes (each tool in its own round-corner box)
 * 3. Final response (outside boxes, regular text)
 * 
 * NO pulsating borders. NO double showcase. Clean separation.
 */

import React, { memo } from 'react';
import { Box } from 'ink';
import { ThinkingStream } from './ThinkingStream.js';
import { ToolCallBox, type ToolCall } from './ToolCallBox.js';

export interface StreamEvent {
  type: 'thought' | 'tool_start' | 'tool_end' | 'text';
  id?: string;
  content?: string;
  tool?: ToolCall;
}

interface StreamContainerProps {
  events: StreamEvent[];
  isStreaming?: boolean;
}

export const StreamContainer = memo(function StreamContainer({
  events,
  isStreaming = false,
}: StreamContainerProps) {
  // Extract thoughts for the thinking stream
  const thoughts = events
    .filter(e => e.type === 'thought')
    .map(e => e.content || '');

  // Extract tool calls
  const toolMap = new Map<string, ToolCall>();
  
  events.forEach(event => {
    if (event.type === 'tool_start' && event.tool) {
      toolMap.set(event.tool.id, { ...event.tool, status: 'running' });
    }
    if (event.type === 'tool_end' && event.id) {
      const existing = toolMap.get(event.id);
      if (existing) {
        toolMap.set(event.id, { ...existing, status: 'done' });
      }
    }
  });

  const tools = Array.from(toolMap.values());

  return (
    <Box flexDirection="column">
      {/* Phase 1: Thinking stream (NO BOX) */}
      <ThinkingStream thoughts={thoughts} isStreaming={isStreaming} />

      {/* Phase 2: Tool call boxes (EACH IN OWN BOX) */}
      {tools.map(tool => (
        <ToolCallBox key={tool.id} tool={tool} />
      ))}
    </Box>
  );
});

export default StreamContainer;
