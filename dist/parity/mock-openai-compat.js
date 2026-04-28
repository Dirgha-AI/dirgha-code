/**
 * Single-port HTTP server that serves scripted SSE responses for the
 * OpenAI-compatible dialect. Used by the parity harness to drive the
 * real provider adapters against deterministic fixtures.
 */
import { createServer } from 'node:http';
export async function startMockOpenAICompat(queue) {
    const pending = [...queue];
    const server = createServer((req, res) => {
        const response = pending.shift() ?? { chunks: [] };
        const status = response.status ?? 200;
        res.writeHead(status, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...response.headers,
        });
        // Consume request body fully before replying to match real server semantics.
        req.on('data', () => { });
        req.on('end', () => {
            for (const chunk of response.chunks) {
                res.write(`data: ${chunk}\n\n`);
            }
            res.end();
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}`;
    return {
        url,
        close: () => new Promise(resolve => server.close(() => resolve())),
    };
}
//# sourceMappingURL=mock-openai-compat.js.map