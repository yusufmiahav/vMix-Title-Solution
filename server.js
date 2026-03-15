const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── State ───────────────────────────────────────────────────────────────────
let namesDb = [];
let state = {
  current: { id: null, name: '', title: '', organisation: '', isBlank: true },
  mode: 'remote',        // 'remote' | 'streamdeck'
  currentIndex: -1,      // for next/prev navigation
  history: [],
  lastUpdated: null,
  lastUpdatedBy: 'system'
};

// ─── Load CSV ─────────────────────────────────────────────────────────────────
function loadNames() {
  try {
    const csvPath = path.join(__dirname, 'data', 'names.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    namesDb = parse(content, { columns: true, skip_empty_lines: true });
    console.log(`Loaded ${namesDb.length} names from CSV`);
  } catch (e) {
    console.error('Could not load names.csv:', e.message);
  }
}

// Watch CSV for live reload
function watchNames() {
  const csvPath = path.join(__dirname, 'data', 'names.csv');
  fs.watchFile(csvPath, { interval: 2000 }, () => {
    console.log('names.csv changed — reloading...');
    loadNames();
    broadcast({ type: 'db_reloaded', count: namesDb.length });
  });
}

loadNames();
watchNames();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function lookupById(id) {
  return namesDb.find(r => String(r.id) === String(id)) || null;
}

function setState(person, updatedBy = 'operator') {
  const prev = { ...state.current };
  state.current = person
    ? { id: person.id, name: person.name, title: person.title, organisation: person.organisation, isBlank: false }
    : { id: null, name: '', title: '', organisation: '', isBlank: true };
  state.lastUpdated = new Date().toISOString();
  state.lastUpdatedBy = updatedBy;

  if (person) {
    state.currentIndex = namesDb.findIndex(r => String(r.id) === String(person.id));
    state.history.unshift({ ...state.current, time: state.lastUpdated });
    if (state.history.length > 20) state.history.pop();
  }

  broadcast({
    type: 'title_changed',
    current: state.current,
    isBlank: state.current.isBlank,
    updatedBy,
    timestamp: state.lastUpdated
  });

  console.log(`[${updatedBy}] → ${person ? `#${person.id} ${person.name}` : 'BLANK'}`);
  return state.current;
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
}

// ─── REST API ─────────────────────────────────────────────────────────────────

// VMix polls this — returns plain text for VMix Data Sources
app.get('/vmix/name', (req, res) => {
  res.type('text').send(state.current.name || '');
});
app.get('/vmix/title', (req, res) => {
  res.type('text').send(state.current.title || '');
});
app.get('/vmix/organisation', (req, res) => {
  res.type('text').send(state.current.organisation || '');
});
app.get('/vmix/isblank', (req, res) => {
  res.type('text').send(state.current.isBlank ? '1' : '0');
});

// Full current state (for UI polling fallback)
app.get('/current', (req, res) => {
  res.json(state.current);
});

// Lookup by number (used by operators)
app.get('/lookup/:id', (req, res) => {
  const person = lookupById(req.params.id);
  if (person) res.json({ found: true, person });
  else res.json({ found: false });
});

// Set title by ID
app.post('/set/:id', (req, res) => {
  const person = lookupById(req.params.id);
  if (!person) return res.status(404).json({ error: 'ID not found' });
  const result = setState(person, req.body.operator || 'operator');
  res.json({ ok: true, current: result });
});

// Clear title (blank)
app.post('/clear', (req, res) => {
  const result = setState(null, req.body.operator || 'operator');
  res.json({ ok: true, current: result });
});

// StreamDeck: next person
app.post('/next', (req, res) => {
  if (namesDb.length === 0) return res.status(400).json({ error: 'No names loaded' });
  const nextIndex = state.currentIndex < namesDb.length - 1 ? state.currentIndex + 1 : 0;
  const result = setState(namesDb[nextIndex], 'streamdeck');
  res.json({ ok: true, current: result, index: nextIndex });
});

// StreamDeck: previous person
app.post('/prev', (req, res) => {
  if (namesDb.length === 0) return res.status(400).json({ error: 'No names loaded' });
  const prevIndex = state.currentIndex > 0 ? state.currentIndex - 1 : namesDb.length - 1;
  const result = setState(namesDb[prevIndex], 'streamdeck');
  res.json({ ok: true, current: result, index: prevIndex });
});

// Set mode
app.post('/mode', (req, res) => {
  const { mode } = req.body;
  if (!['remote', 'streamdeck'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  state.mode = mode;
  broadcast({ type: 'mode_changed', mode });
  res.json({ ok: true, mode });
});

// Get full DB (for UI)
app.get('/db', (req, res) => {
  res.json(namesDb);
});

// History
app.get('/history', (req, res) => {
  res.json(state.history);
});

// Health / server info
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    namesCount: namesDb.length,
    mode: state.mode,
    current: state.current,
    uptime: process.uptime(),
    serverTime: new Date().toISOString()
  });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`WS connected: ${ip}`);

  // Send full state on connect
  ws.send(JSON.stringify({
    type: 'init',
    current: state.current,
    mode: state.mode,
    namesCount: namesDb.length,
    history: state.history.slice(0, 5)
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) {}
  });

  ws.on('close', () => console.log(`WS disconnected: ${ip}`));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) { localIp = iface.address; break; }
    }
  }
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   VMix Title Controller — Server Running     ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}              ║`);
  console.log(`║  Network:  http://${localIp}:${PORT}        ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  VMix Data Source URLs:                      ║');
  console.log(`║  Name:  http://localhost:${PORT}/vmix/name      ║`);
  console.log(`║  Title: http://localhost:${PORT}/vmix/title     ║`);
  console.log(`║  Org:   http://localhost:${PORT}/vmix/org       ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  StreamDeck endpoints:                       ║');
  console.log(`║  Next:  POST http://localhost:${PORT}/next      ║`);
  console.log(`║  Prev:  POST http://localhost:${PORT}/prev      ║`);
  console.log(`║  Clear: POST http://localhost:${PORT}/clear     ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
});
