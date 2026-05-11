/**
 * agent-server.ts — Tool that routes specialized tasks to the LangGraph
 * agent-server on port 4100 (bio, CAD, voice, science, grants, etc.)
 *
 * The CLI agent calls this tool when it detects a task that requires
 * capabilities beyond its built-in tools. The agent-server runs Python
 * with domain-specific libraries (RDKit, FreeCAD, etc.).
 */
import type { Tool } from "./registry.js";
export declare const agentServerTool: Tool;
