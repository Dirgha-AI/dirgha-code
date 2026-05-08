/**
 * transactional_write tool — atomic multi-model write across all four
 * data shapes (relational + FTS + vector + graph).
 *
 * Accepts an optional message, embedding, graph nodes, and graph edges
 * in a single tool call. Everything commits or nothing does — the agent
 * gets a true per-session ACID guarantee.
 */

import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { transactional } from "../state/transaction.js";

interface Input {
  message?: { role: "user" | "assistant" | "system" | "tool"; content: string };
  embedding?: { source: string; chunk: string; vec: number[] };
  nodes?: Array<{
    id: string;
    type: string;
    props?: Record<string, unknown>;
  }>;
  edges?: Array<{
    src: string;
    dst: string;
    rel: string;
    props?: Record<string, unknown>;
  }>;
}

interface Output {
  message_id: number | null;
  embedding_id: number | null;
  node_ids: string[];
  edge_count: number;
  rolled_back: boolean;
}

export const transactionalWriteTool: Tool = {
  name: "transactional_write",
  description:
    "Atomic multi-model write. Insert a message, an embedding, graph " +
    "nodes, and graph edges in ONE transaction. Either all commit or " +
    "all roll back — agent gets the per-session ACID guarantee.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["user", "assistant", "system", "tool"],
          },
          content: { type: "string" },
        },
        required: ["role", "content"],
      },
      embedding: {
        type: "object",
        properties: {
          source: { type: "string" },
          chunk: { type: "string" },
          vec: { type: "array", items: { type: "number" } },
        },
        required: ["source", "chunk", "vec"],
      },
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            props: { type: "object" },
          },
          required: ["id", "type"],
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            src: { type: "string" },
            dst: { type: "string" },
            rel: { type: "string" },
            props: { type: "object" },
          },
          required: ["src", "dst", "rel"],
        },
      },
    },
  },
  async execute(rawInput: unknown, _ctx): Promise<ToolResult<Output>> {
    const input = rawInput as Input;
    if (
      !input.message &&
      !input.embedding &&
      (!input.nodes || input.nodes.length === 0) &&
      (!input.edges || input.edges.length === 0)
    ) {
      return {
        content:
          "transactional_write requires at least one of: message, embedding, nodes, edges",
        isError: true,
      };
    }
    let messageId: number | null = null;
    let embeddingId: number | null = null;
    const nodeIds: string[] = [];
    let edgeCount = 0;
    try {
      transactional((tx) => {
        if (input.message) {
          messageId = tx.message.insert(input.message);
        }
        if (input.embedding) {
          embeddingId = tx.embedding.insert(input.embedding);
        }
        for (const n of input.nodes ?? []) {
          tx.graph.addNode(n);
          nodeIds.push(n.id);
        }
        for (const e of input.edges ?? []) {
          tx.graph.addEdge(e);
          edgeCount++;
        }
      });
    } catch (err) {
      return {
        content: `transactional_write rolled back: ${(err as Error).message}`,
        data: {
          message_id: null,
          embedding_id: null,
          node_ids: [],
          edge_count: 0,
          rolled_back: true,
        },
        isError: true,
      };
    }
    const summary = [
      messageId !== null ? `message_id=${messageId}` : null,
      embeddingId !== null ? `embedding_id=${embeddingId}` : null,
      nodeIds.length > 0 ? `nodes=[${nodeIds.join(",")}]` : null,
      edgeCount > 0 ? `edges=${edgeCount}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      content: `committed: ${summary}`,
      data: {
        message_id: messageId,
        embedding_id: embeddingId,
        node_ids: nodeIds,
        edge_count: edgeCount,
        rolled_back: false,
      },
      isError: false,
    };
  },
};
