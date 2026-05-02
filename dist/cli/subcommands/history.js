/**
 * `dirgha history [query]` — browse and search local chat history.
 *
 * With no arguments: lists recent sessions from ~/.dirgha/dirgha.db.
 * With a query: full-text searches all messages via SQLite FTS5.
 */
import { dbSearchChats, dbListSessions } from "../../state/db.js";
export const historySubcommand = {
    name: "history",
    description: "Search and browse local chat history stored in ~/.dirgha/dirgha.db",
    aliases: ["h"],
    async run(argv) {
        const query = argv.filter(a => !a.startsWith("-")).join(" ").trim();
        if (query) {
            const results = dbSearchChats(query, 20);
            if (!results.length) {
                process.stdout.write(`No results for: ${query}\n`);
                return 0;
            }
            process.stdout.write(`${results.length} result(s) for "${query}":\n\n`);
            for (const r of results) {
                const ts = new Date(r.ts).toLocaleString();
                const preview = r.content.slice(0, 200).replace(/\n/g, " ");
                process.stdout.write(`  [${r.role}] ${ts} (${r.sessionId.slice(0, 8)})\n  ${preview}\n\n`);
            }
            return 0;
        }
        // List recent sessions
        const sessions = dbListSessions(20);
        if (!sessions.length) {
            process.stdout.write("No sessions yet. Start a conversation with: dirgha\n");
            return 0;
        }
        process.stdout.write(`Recent sessions (${sessions.length}):\n\n`);
        for (const s of sessions) {
            const started = new Date(s.started_at).toLocaleString();
            const status = s.ended_at ? "done" : "active";
            process.stdout.write(`  ${s.id.slice(0, 8)}  ${started}  ${status}  ${s.messageCount} msg(s)` +
                (s.model ? `  [${s.model}]` : "") + "\n");
        }
        process.stdout.write("\nSearch: dirgha history <query>\n");
        return 0;
    },
};
//# sourceMappingURL=history.js.map