import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SlashCommand } from "./types.js";

const VALID_FORMATS = ["markdown", "json", "html"] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

function exportsDir(): string {
  const d = join(homedir(), ".dirgha", "exports");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    try {
      const p = JSON.parse(content);
      if (Array.isArray(p)) {
        return (
          p
            .filter(
              (b: unknown) => (b as Record<string, unknown>)?.type === "text",
            )
            .map((b: unknown) => (b as Record<string, string>)?.text ?? "")
            .join("\n") || content
        );
      }
    } catch {
      /* not JSON */
    }
    return content;
  }
  if (Array.isArray(content)) {
    return (content as Array<unknown>)
      .filter((b: unknown) => (b as Record<string, unknown>)?.type === "text")
      .map((b: unknown) => (b as Record<string, string>)?.text ?? "")
      .join("\n");
  }
  return JSON.stringify(content);
}

export const exportCommand: SlashCommand = {
  name: "export",
  description: "Export session as markdown, JSON, or HTML",
  async execute(args, ctx) {
    let fmtRaw = args[0]?.toLowerCase();
    const format: ExportFormat =
      fmtRaw && VALID_FORMATS.includes(fmtRaw as ExportFormat)
        ? (fmtRaw as ExportFormat)
        : "markdown";

    const extMap: Record<ExportFormat, string> = {
      markdown: "md",
      json: "json",
      html: "html",
    };
    const ext = extMap[format];

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultName = `dirgha-export-${ts}.${ext}`;
    const outPath = args[1]
      ? join(process.cwd(), args[1])
      : join(exportsDir(), defaultName);

    const session = ctx.getSession();
    const msgs = session ? await session.messages() : [];

    let output: string;
    if (format === "json") {
      const data = {
        sessionId: ctx.sessionId,
        model: ctx.model,
        exportedAt: new Date().toISOString(),
        messageCount: msgs.length,
        messages: msgs.map((m) => ({
          role: m.role,
          content: extractText(m.content),
        })),
      };
      output = JSON.stringify(data, null, 2);
    } else if (format === "html") {
      const rows = msgs
        .map((m) => {
          const role = String(m.role ?? "");
          const content = extractText(m.content)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
          const cls =
            role === "user"
              ? "user"
              : role === "assistant"
                ? "assistant"
                : "system";
          return `<div class="msg ${cls}"><span class="role">${role}</span><div class="body">${content}</div></div>`;
        })
        .join("\n");

      output = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dirgha Export — ${ts}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{background:#0d1117;color:#c9d1d9;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;max-width:900px;margin:40px auto;padding:0 24px;line-height:1.6}
h1{color:#58a6ff;font-size:1.4em;border-bottom:1px solid #21262d;padding-bottom:12px;margin-bottom:32px}
.msg{margin:20px 0;padding:12px 16px;border-radius:6px;border-left:3px solid}
.msg.user{background:#161b22;border-color:#58a6ff}
.msg.assistant{background:#0d1117;border-color:#3fb950}
.msg.system{background:#161b22;border-color:#8b949e}
.role{font-size:.7em;color:#8b949e;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;display:block}
.body{margin:0;white-space:pre-wrap;word-break:break-word}
pre{background:#161b22;padding:12px;border-radius:4px;overflow-x:auto;margin:8px 0}
code{background:#1f242f;padding:1px 4px;border-radius:3px;font-size:.9em}
pre code{background:none;padding:0}
strong{color:#e6edf3}
em{color:#b1bac4}
</style>
</head>
<body>
<h1>Dirgha Session Export — ${ts}</h1>
${rows}
</body>
</html>`;
    } else {
      const sections = msgs
        .map((m) => {
          const role = String(m.role ?? "");
          const content = extractText(m.content);
          return `### ${role}\n\n${content}`;
        })
        .join("\n\n---\n\n");

      output = `# Dirgha Session Export

**Session**: ${ctx.sessionId}

**Model**: ${ctx.model}

**Messages**: ${msgs.length}

**Exported**: ${new Date().toISOString()}

---

${sections}
`;
    }

    writeFileSync(outPath, output, "utf8");

    return [
      `Exported ${msgs.length} messages`,
      `  Format: ${format}`,
      `  Path:   ${outPath}`,
    ].join("\n");
  },
};
