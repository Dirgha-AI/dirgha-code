import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/', c => c.json({ ok: true, msg: 'Scaffolded by dirgha. Edit src/index.ts.' }));

app.get('/health', c => c.json({ status: 'ok', uptime: process.uptime() }));

// Iterate via: dirgha ask "add a /todos endpoint with in-memory CRUD"
app.get('/echo/:msg', c => c.json({ echo: c.req.param('msg') }));

const port = Number(process.env.PORT) || 3001;
serve({ fetch: app.fetch, port }, info => {
  console.log(`Hono API listening on http://localhost:${info.port}`);
});
