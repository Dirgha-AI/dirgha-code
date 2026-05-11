/**
 * agent-server.ts — Tool that routes specialized tasks to the LangGraph
 * agent-server on port 4100 (bio, CAD, voice, science, grants, etc.)
 *
 * The CLI agent calls this tool when it detects a task that requires
 * capabilities beyond its built-in tools. The agent-server runs Python
 * with domain-specific libraries (RDKit, FreeCAD, etc.).
 */
const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL ?? "http://localhost:4100";
export const agentServerTool = {
    name: "agent_server",
    description: `Route specialized tasks to the agent server (port 4100).
Use this for:
  - Bio/chemical analysis (protein sequences, molecule docking, drug discovery)
  - CAD modeling (parametric 3D models, manufacturing export)
  - Voice generation (text-to-speech, speech-to-text)
  - Scientific research (paper analysis, literature review)
  - Grant proposals (analysis, writing, compliance checking)
  - Sandboxed code execution (secure, isolated Python/Node.js)

The agent server has access to Python libraries not available in the CLI.

Examples:
  "Analyze this protein sequence for drug binding" → route to agent server
  "Create a parametric CAD model of a phone case" → route to agent server
  "Generate a voice narration for this script" → route to agent server`,
    inputSchema: {
        type: "object",
        properties: {
            prompt: { type: "string", description: "The specialized task to perform." },
            domain: {
                type: "string",
                enum: ["bio", "cad", "voice", "science", "grant", "sandbox", "general"],
                description: "Domain of the task. Default: auto-detected.",
            },
        },
        required: ["prompt"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const domain = input.domain ?? "general";
        try {
            const response = await fetch(`${AGENT_SERVER_URL}/v1/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: input.prompt }],
                    user_id: _ctx.sessionId || "cli-user",
                    skills: [domain],
                }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok) {
                const err = await response.text().catch(() => "unknown");
                return { isError: true, content: `Agent server error (${response.status}): ${err}` };
            }
            const data = (await response.json());
            return {
                isError: false,
                content: data.content ?? "(no output from agent server)",
                metadata: {
                    toolCalls: data.tool_calls,
                    threadId: data.thread_id,
                },
            };
        }
        catch (err) {
            if (err.name === "AbortError") {
                return { isError: true, content: "Agent server request timed out after 120s." };
            }
            return { isError: true, content: `Agent server unreachable: ${err.message}` };
        }
    },
};
//# sourceMappingURL=agent-server.js.map