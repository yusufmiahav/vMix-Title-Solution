# VMix Title Controller

Low-latency lower-thirds title control for VMix.  
Replaces Google Sheets/Cloud API (~5s latency) with a local server (~1–5ms).

---

## Requirements

- **Node.js** — download from https://nodejs.org (LTS version)
- VMix (any version with Data Sources support)
- All machines on the same local network

---

## Quick Start

1. Double-click **START.bat**
2. Open **http://localhost:3000** in your browser
3. Configure VMix (see below)

---

## VMix Setup

In VMix: **Settings → Data Sources → Add New**

Add three Web data sources:

| Field | URL |
|-------|-----|
| Name | `http://localhost:3000/vmix/name` |
| Title/Role | `http://localhost:3000/vmix/title` |
| Organisation | `http://localhost:3000/vmix/organisation` |

- Set **Polling Interval to 500ms** (or even 250ms — it's local, it's fine)
- In your title template, map each field to its data source value

---

## Names Database

Edit `data/names.csv` — the server auto-reloads when you save it.

```
id,name,title,organisation
1,John Smith,Senior Pastor,First Baptist Church
2,Sarah Johnson,Worship Leader,First Baptist Church
```

---

## Two Operating Modes

### Mode A — Remote Operator
The remote operator opens `http://YOUR-PC-IP:3000` on any device on the network.  
They type an ID number → name resolves instantly → click Go Live.

The VMix operator's screen flashes green (title updated) or red (blank).

### Mode B — StreamDeck
Configure StreamDeck to send HTTP requests:

| Action | Method | URL |
|--------|--------|-----|
| Next title | POST | `http://localhost:3000/next` |
| Previous title | POST | `http://localhost:3000/prev` |
| Clear/blank | POST | `http://localhost:3000/clear` |
| Set specific ID | POST | `http://localhost:3000/set/5` |

Use the **StreamDeck HTTP Request** plugin (or Companion).

---

## Bitfocus Companion Integration

Connect Companion via WebSocket to `ws://localhost:3000`

The server sends these events:
```json
{ "type": "title_changed", "isBlank": false, "current": { "name": "...", "title": "..." } }
```

**Recommended Companion setup:**
- Trigger on `title_changed` where `isBlank = false` → flash button green
- Trigger on `title_changed` where `isBlank = true` → flash button red/blank
- Show current name on a button using the `current.name` field

---

## All API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/vmix/name` | Current name (plain text for VMix) |
| GET | `/vmix/title` | Current title/role (plain text) |
| GET | `/vmix/organisation` | Current organisation (plain text) |
| GET | `/current` | Full current state (JSON) |
| GET | `/lookup/:id` | Look up a person by ID |
| POST | `/set/:id` | Set title to person ID |
| POST | `/clear` | Blank the title |
| POST | `/next` | Next person in list |
| POST | `/prev` | Previous person in list |
| GET | `/db` | Full names database |
| GET | `/status` | Server health + state |

---

## Latency

| Method | Typical latency |
|--------|----------------|
| Google Sheets + Cloud API | 3–8 seconds |
| This server (local network) | 1–10ms |

---

## Network

The server listens on **all interfaces (0.0.0.0:3000)**.  
Remote operators use `http://YOUR-PC-IP:3000`.

Your PC's IP is printed in the console when the server starts.

To find your IP: open Command Prompt → type `ipconfig` → look for IPv4 Address.
