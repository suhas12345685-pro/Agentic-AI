/**
 * JARVIS Gateway — Backend Server
 * Express + WebSocket on port 4747
 *
 * API Routes:
 *   POST   /api/chat         → Send message, stream response via WS
 *   GET    /api/skills       → List skills
 *   POST   /api/skills       → Register skill
 *   PATCH  /api/skills/:id   → Update skill
 *   DELETE /api/skills/:id   → Delete skill
 *   GET    /api/crons        → List cron jobs
 *   POST   /api/crons        → Create cron job
 *   PATCH  /api/crons/:id    → Update cron job
 *   DELETE /api/crons/:id    → Delete cron job
 *   GET    /api/connections   → List connections (keys masked)
 *   POST   /api/connections   → Add connection
 *   DELETE /api/connections/:id → Remove connection
 *   GET    /api/nodes        → System health + stats
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, db } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.GATEWAY_PORT || '4747', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(resolve(__dirname, '..', 'frontend', 'public')));

// ─── Health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', timestamp: Date.now(), version: '1.0.0' });
});

// ─── Chat ────────────────────────────────────────────────
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  // Store the message and return a placeholder response
  // In production, this routes through the JARVIS orchestrator
  const response = `Acknowledged: "${message}". JARVIS core integration pending.`;
  res.json({ response, timestamp: Date.now() });
});

// ─── Skills CRUD ─────────────────────────────────────────
app.get('/api/skills', (_req, res) => {
  const skills = db().prepare('SELECT * FROM skills ORDER BY created_at DESC').all();
  res.json(skills);
});

app.post('/api/skills', (req, res) => {
  const { name, description, enabled } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const stmt = db().prepare('INSERT INTO skills (name, description, enabled) VALUES (?, ?, ?)');
  const result = stmt.run(name, description || '', enabled !== false ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, name, description, enabled: enabled !== false });
});

app.patch('/api/skills/:id', (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;

  const stmt = db().prepare('UPDATE skills SET enabled = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, id);
  res.json({ id, enabled });
});

app.delete('/api/skills/:id', (req, res) => {
  db().prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ─── Crons CRUD ──────────────────────────────────────────
app.get('/api/crons', (_req, res) => {
  const crons = db().prepare('SELECT * FROM crons ORDER BY created_at DESC').all();
  res.json(crons);
});

app.post('/api/crons', (req, res) => {
  const { name, expression, task, enabled } = req.body;
  if (!name || !expression) return res.status(400).json({ error: 'Name and expression required' });

  const stmt = db().prepare('INSERT INTO crons (name, expression, task, enabled) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, expression, task || '', enabled !== false ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, name, expression, task, enabled: enabled !== false });
});

app.patch('/api/crons/:id', (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;

  const stmt = db().prepare('UPDATE crons SET enabled = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, id);
  res.json({ id, enabled });
});

app.delete('/api/crons/:id', (req, res) => {
  db().prepare('DELETE FROM crons WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ─── Connections CRUD ────────────────────────────────────
app.get('/api/connections', (_req, res) => {
  const connections = db().prepare('SELECT id, name, service, created_at FROM connections ORDER BY created_at DESC').all();
  res.json(connections.map(c => ({ ...c, key: '****' })));
});

app.post('/api/connections', (req, res) => {
  const { name, service, key } = req.body;
  if (!name || !key) return res.status(400).json({ error: 'Name and key required' });

  const stmt = db().prepare('INSERT INTO connections (name, service, key) VALUES (?, ?, ?)');
  const result = stmt.run(name, service || '', key);
  res.status(201).json({ id: result.lastInsertRowid, name, service, key: '****' });
});

app.delete('/api/connections/:id', (req, res) => {
  db().prepare('DELETE FROM connections WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ─── Nodes (System Stats) ────────────────────────────────
app.get('/api/nodes', (_req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
    timestamp: Date.now(),
  });
});

// ─── SPA Fallback ────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(resolve(__dirname, '..', 'frontend', 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'chat') {
        // Echo back for now — JARVIS core integration will handle real responses
        ws.send(JSON.stringify({
          type: 'response',
          message: `JARVIS received: "${parsed.message}"`,
          timestamp: Date.now(),
        }));
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'JARVIS Gateway WebSocket connected' }));
});

// Initialize database and start
initDatabase();
server.listen(PORT, () => {
  console.log(`\n  JARVIS Gateway running on http://localhost:${PORT}\n`);
});

export default server;
