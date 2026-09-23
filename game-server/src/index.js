// Cannons & Coastlines online play.
//
//   Worker        routes /game/api/* (also accepts bare /api/* and / for local dev)
//   Lobby DO      one instance: the public list of games, pushed to watchers
//   GameRoom DO   one per game: seats, lobby room, and the authoritative
//                 rules engine (the same code the browser game runs)
//
// Both Durable Objects use the WebSocket Hibernation API, so an idle game
// costs nothing while players think.
import { DurableObject } from 'cloudflare:workers';

/** How long a lobby with nobody in it stays listed. */
const LOBBY_IDLE_MS = 3 * 60 * 1000
import { engine } from './engine.gen.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...CORS } });
const lobbyStub = env => env.LOBBY.get(env.LOBBY.idFromName('main'));
const gameStub = (env, code) => env.GAME.get(env.GAME.idFromName(code));

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return [...b].map(x => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/game\/api/, '').replace(/^\/api/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (path === '/' || path === '/health') return json({ ok: true, service: 'cannons-and-coastlines-game' });
    if (path === '/lobby') return lobbyStub(env).fetch(request);
    if (path === '/games' && request.method === 'GET') return json({ games: await lobbyStub(env).list() });
    if (path === '/games' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) { /* defaults */ }
      const settings = {
        name: String(body.name || 'Open waters').slice(0, 32),
        maxPlayers: Math.max(2, Math.min(engine.MAX_SEATS, body.maxPlayers | 0 || 4)),
        timer: [0, 60, 90, 120, 180].includes(body.timer | 0) ? body.timer | 0 : 90,
      };
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        if (await gameStub(env, code).init(code, settings)) return json({ code });
      }
      return json({ error: 'Could not find a free game code.' }, 503);
    }
    const m = path.match(/^\/games\/([A-Z0-9]{4,8})(\/ws)?$/);
    if (m && m[2]) return gameStub(env, m[1]).fetch(request);
    if (m) return json(await gameStub(env, m[1]).info());
    return json({ error: 'Not found' }, 404);
  },
};

// ═══ Lobby ═════════════════════════════════════════════

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS games (
      code TEXT PRIMARY KEY, name TEXT, max INTEGER, players INTEGER, humans INTEGER,
      status TEXT, updated INTEGER)`);
  }

  list() {
    const since = Date.now() - 6 * 3600 * 1000;
    return this.sql.exec(`SELECT code, name, max, players, humans, status FROM games
      WHERE updated > ? AND status != 'over' AND humans > 0 ORDER BY (status = 'lobby') DESC, updated DESC LIMIT 60`, since)
      .toArray();
  }

  async update(e) {
    this.sql.exec(`INSERT INTO games (code, name, max, players, humans, status, updated) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET name = excluded.name, max = excluded.max, players = excluded.players, humans = excluded.humans,
      status = excluded.status, updated = excluded.updated`,
      e.code, e.name, e.max, e.players, e.humans, e.status, Date.now());
    // Forget long-finished games.
    this.sql.exec(`DELETE FROM games WHERE updated < ?`, Date.now() - 48 * 3600 * 1000);
    this.broadcast();
  }

  broadcast() {
    const msg = JSON.stringify({ type: 'games', games: this.list() });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (e) { /* closed */ } }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ games: this.list() });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: 'games', games: this.list() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws) { ws.send(JSON.stringify({ type: 'games', games: this.list() })); }
  async webSocketClose() { /* nothing to clean up */ }
}

// ═══ Game room ═════════════════════════════════════════

const AI_NAMES = ['Captain Flint', 'Anne Bonny', 'Calico Jack', 'Mary Read', 'Black Bart', 'Ching Shih', 'Grace O’Malley'];

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.aiStep = Math.max(50, +(env.AI_STEP_MS || 1100));
    this.lobbyIdle = Math.max(1000, +(env.LOBBY_IDLE_MS || LOBBY_IDLE_MS));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get('room')) || null;
      this.game = (await ctx.storage.get('game')) || null;
      this.meta = (await ctx.storage.get('meta')) || { seq: 0, rng: 0, deadline: null, deadlineTurn: null };
    });
  }

  // ─── RPC from the Worker ──────────────────────────
  async init(code, settings) {
    if (this.room) return false;
    this.room = {
      code, name: settings.name, max: settings.maxPlayers, timer: settings.timer,
      status: 'lobby', host: null, seats: [], nextSeat: 1, created: Date.now(),
    };
    this.meta = { seq: 0, rng: crypto.getRandomValues(new Uint32Array(1))[0], deadline: null, deadlineTurn: null };
    await this.save();
    await this.publish();
    await this.schedule(); // closes it if the creator never shows up
    return true;
  }

  async info() {
    if (!this.room) return { error: 'No such game.' };
    return { code: this.room.code, name: this.room.name, status: this.room.status, players: this.room.seats.length, max: this.room.max };
  }

  // ─── Persistence and broadcast ────────────────────
  async save() {
    await this.ctx.storage.put({ room: this.room, game: this.game, meta: this.meta });
  }

  async publish() {
    const r = this.room;
    try {
      await lobbyStub(this.env).update({
        code: r.code, name: r.name, max: r.max, players: r.seats.length,
        humans: r.seats.filter(s => !s.ai).length, status: r.status,
      });
    } catch (e) { console.error('lobby update failed', e); }
  }

  publicRoom() {
    const r = this.room;
    const away = this.away();
    return {
      code: r.code, name: r.name, max: r.max, timer: r.timer, status: r.status, host: r.host, rules: engine.RULES_VERSION,
      spectators: this.sockets().filter(ws => !this.seatOf(ws)).length,
      seats: r.seats.map(s => ({ seat: s.seat, name: s.name, faction: s.faction, color: s.color, ready: s.ready, ai: s.ai, connected: s.ai || !away.includes(s.seat) })),
    };
  }

  sockets() { return this.ctx.getWebSockets(); }
  seatOf(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.token || !this.room) return null;
    return this.room.seats.find(s => s.token === a.token) || null;
  }
  /** Human seats with no open socket. */
  away() {
    if (!this.room) return [];
    const on = new Set(this.sockets().map(ws => this.seatOf(ws)).filter(Boolean).map(s => s.seat));
    return this.room.seats.filter(s => !s.ai && !on.has(s.seat)).map(s => s.seat);
  }

  send(ws, m) { try { ws.send(JSON.stringify(m)); } catch (e) { /* closed */ } }
  broadcast(m) { const s = JSON.stringify(m); for (const ws of this.sockets()) { try { ws.send(s); } catch (e) { /* closed */ } } }
  broadcastRoom() { this.broadcast({ type: 'room', room: this.publicRoom() }); }
  stateMsg() { return { type: 'state', seq: this.meta.seq, game: this.game, deadline: this.meta.deadline, away: this.away() }; }

  // ─── Engine access ────────────────────────────────
  // The engine keeps its state in one module-level variable, shared by
  // every game in this isolate, so each use is a synchronous
  // load-run-store with nothing awaited in between.
  withEngine(fn) {
    engine.G = this.game;
    const rng = engine.seededRandom(this.meta.rng);
    engine.setRand(rng);
    engine.setAiEffort('lite');
    try { return fn(); } finally {
      this.meta.rng = rng.state();
      this.game = engine.G;
      engine.G = null;
    }
  }

  // ─── Sockets ──────────────────────────────────────
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return json(await this.info());
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ token: null });
    if (!this.room) server.close(4404, 'No such game');
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (!this.room || typeof raw !== 'string' || raw.length > 8000) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    try {
      await this.onMessage(ws, m);
    } catch (err) {
      console.error(err);
      this.send(ws, { type: 'error', id: m && m.id, msg: 'Something went wrong on the server.' });
    }
  }

  async webSocketClose(ws) {
    try { ws.serializeAttachment({ token: null }); } catch (e) { /* gone */ }
    try { ws.close(1000); } catch (e) { /* already closed */ }
    if (!this.room) return;
    this.broadcast({ type: 'presence', away: this.away() });
    await this.schedule();
  }

  async onMessage(ws, m) {
    const R = this.room;
    const seat = this.seatOf(ws);
    const isHost = seat && R.host === seat.seat;
    const inLobby = R.status === 'lobby';
    switch (m.type) {
      case 'hello': {
        const name = String(m.name || 'Captain').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Captain';
        let s = m.token ? R.seats.find(x => x.token === m.token) : null;
        if (!s && inLobby && R.seats.length < R.max) {
          const used = new Set(R.seats.map(x => x.color));
          s = {
            seat: R.nextSeat++, token: crypto.randomUUID(), name, ai: false, ready: false,
            faction: engine.FACTION_ORDER[R.seats.length % 2], color: [0, 1, 2, 3, 4, 5, 6].find(c => !used.has(c)),
          };
          R.seats.push(s);
          if (R.host == null) R.host = s.seat;
        }
        if (s && inLobby) s.name = name;
        ws.serializeAttachment({ token: s ? s.token : null });
        this.send(ws, { type: 'welcome', seat: s ? s.seat : null, token: s ? s.token : null, spectator: !s });
        if (s && s.ai === 'left' && this.game) { s.ai = false; this.game.players[s.seat].ai = false; } // back after leaving mid-game
        await this.save();
        this.broadcastRoom();
        if (R.status !== 'lobby' && this.game) this.send(ws, this.stateMsg());
        this.broadcast({ type: 'presence', away: this.away() });
        if (inLobby) await this.publish();
        await this.schedule();
        return;
      }
      case 'seat': {
        if (!seat || !inLobby) return;
        if (m.faction && engine.FACTION_DEFS[m.faction]) seat.faction = m.faction;
        if (m.color != null && engine.PALETTE[m.color] && !R.seats.some(x => x !== seat && x.color === m.color)) seat.color = m.color | 0;
        seat.ready = false;
        await this.save(); this.broadcastRoom();
        return;
      }
      case 'ready': {
        if (!seat || !inLobby) return;
        seat.ready = !!m.ready;
        await this.save(); this.broadcastRoom();
        return;
      }
      case 'addAI': {
        if (!isHost || !inLobby || R.seats.length >= R.max) return;
        const used = new Set(R.seats.map(x => x.color));
        const n = R.seats.filter(x => x.ai).length;
        R.seats.push({
          seat: R.nextSeat++, token: 'ai-' + crypto.randomUUID(), name: AI_NAMES[n % AI_NAMES.length], ai: true, ready: true,
          faction: engine.FACTION_ORDER[Math.floor(Math.random() * engine.FACTION_ORDER.length)], color: [0, 1, 2, 3, 4, 5, 6].find(c => !used.has(c)),
        });
        await this.save(); this.broadcastRoom(); await this.publish();
        return;
      }
      case 'kick': {
        if (!isHost || !inLobby) return;
        const i = R.seats.findIndex(x => x.seat === m.seat && x.seat !== R.host);
        if (i < 0) return;
        const [gone] = R.seats.splice(i, 1);
        for (const w of this.sockets()) if (this.seatOf(w) === null && w.deserializeAttachment()?.token === gone.token) this.send(w, { type: 'welcome', seat: null, token: null, spectator: true });
        await this.save(); this.broadcastRoom(); await this.publish();
        return;
      }
      case 'leave': {
        if (!seat) return;
        ws.serializeAttachment({ token: null });
        if (inLobby) {
          R.seats.splice(R.seats.indexOf(seat), 1);
          if (R.host === seat.seat) R.host = (R.seats.find(x => !x.ai) || {}).seat ?? null;
          if (!R.seats.some(x => !x.ai)) R.status = 'over';
        } else if (R.status === 'play' && this.game) {
          // A captain who leaves a running game hands the fleet to the computer.
          const p = this.seatIndex(seat);
          if (p) { this.game.players[p].ai = true; seat.ai = 'left'; }
        }
        await this.save(); this.broadcastRoom(); await this.publish();
        if (this.game) this.broadcast(this.stateMsg());
        await this.schedule();
        return;
      }
      case 'start': {
        if (!isHost || !inLobby) return;
        if (R.seats.length < 2 || !R.seats.every(x => x.ai || x.ready)) { this.send(ws, { type: 'error', msg: 'Every player must be ready, and you need two crews.' }); return; }
        // Turn order is seat order. Renumber seats 1..N so a seat number
        // means the same thing to the room and to the rules engine.
        const hostToken = R.seats.find(x => x.seat === R.host)?.token;
        R.seats.forEach((x, i) => { x.seat = i + 1; });
        R.host = R.seats.find(x => x.token === hostToken)?.seat ?? 1;
        R.order = R.seats.map(x => x.seat);
        for (const w of this.sockets()) { const st = this.seatOf(w); if (st) this.send(w, { type: 'welcome', seat: st.seat, token: st.token, spectator: false }); }
        this.withEngine(() => engine.newGame({
          seats: R.seats.map(x => ({ faction: x.faction, color: x.color, name: x.name, ai: !!x.ai })),
          setup: 'quick', stalemate: false, table: 'round',
        }));
        R.status = 'play';
        this.meta.seq = 0;
        this.setDeadline();
        await this.save();
        this.broadcastRoom();
        this.broadcast(this.stateMsg());
        await this.publish();
        await this.schedule();
        return;
      }
      case 'action': {
        if (R.status !== 'play' || !this.game) return;
        const p = seat && this.seatIndex(seat);
        if (!p) { this.send(ws, { type: 'error', id: m.id, msg: 'You are watching this game.' }); return; }
        const res = this.withEngine(() => engine.act(p, m.a || {}));
        if (!res.ok) { this.send(ws, { type: 'error', id: m.id, msg: res.err }); return; }
        await this.afterAction(res.events, p, m.id);
        return;
      }
      case 'ping':
        this.send(ws, { type: 'pong' });
        return;
    }
  }

  /** Engine seat number (1..N) for a room seat. */
  seatIndex(seat) {
    const i = (this.room.order || []).indexOf(seat.seat);
    return i >= 0 ? i + 1 : null;
  }

  setDeadline() {
    const G = this.game;
    if (!G || G.phase !== 'play') { this.meta.deadline = null; return; }
    if (this.meta.deadlineTurn === G.turn && this.meta.deadline) return;
    const pl = G.players[G.active];
    const seat = this.room.seats[G.active - 1];
    const away = seat && this.away().includes(seat.seat);
    let secs = this.room.timer || 0;
    // No timer, but the captain is not here: do not stall the table.
    if (!pl.ai && away) secs = secs ? Math.min(secs, 45) : 45;
    this.meta.deadline = !pl.ai && secs ? Date.now() + secs * 1000 : null;
    this.meta.deadlineTurn = G.turn;
  }

  async afterAction(events, by, id) {
    this.meta.seq++;
    this.setDeadline();
    // Every ship has gone and nothing is left to spend: end the turn by
    // itself, a beat after the last move has played on everyone's screen.
    const G1 = this.game;
    const human = G1.phase === 'play' && !G1.players[G1.active].ai;
    const done = human && this.withEngine(() => engine.turnIsOver(G1.active));
    this.meta.autoEndAt = done ? Date.now() + engine.eventsDuration(events) + 1000 : null;
    const over = this.game.phase === 'over';
    if (over) this.room.status = 'over';
    await this.save();
    this.broadcast({ type: 'events', seq: this.meta.seq, events, game: this.game, by, id, deadline: this.meta.deadline });
    if (over) { this.broadcastRoom(); await this.publish(); }
    await this.schedule();
  }

  /** One alarm drives both computer moves and the turn timer. */
  async schedule() {
    const G = this.game;
    // A lobby with nobody seated at it closes after a few minutes, so
    // abandoned games drop off the list. (The closing socket's attachment is
    // already cleared, so it doesn't count.)
    if (this.room.status === 'lobby') {
      const seated = this.sockets().filter(ws => this.seatOf(ws)).length;
      if (seated === 0) await this.ctx.storage.setAlarm(Date.now() + this.lobbyIdle);
      else await this.ctx.storage.deleteAlarm();
      return;
    }
    if (!G || this.room.status !== 'play' || G.phase !== 'play') { await this.ctx.storage.deleteAlarm(); return; }
    const pl = G.players[G.active];
    if (pl.ai) { await this.ctx.storage.setAlarm(Date.now() + this.aiStep); return; }
    // A captain who went away mid-turn gets a shorter clock.
    const before = this.meta.deadline;
    this.meta.deadlineTurn = null;
    this.setDeadline();
    if (before && this.meta.deadline && before < this.meta.deadline) this.meta.deadline = before;
    const at = [this.meta.deadline, this.meta.autoEndAt].filter(Boolean);
    if (at.length) await this.ctx.storage.setAlarm(Math.min(...at));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    const G = this.game;
    if (this.room && this.room.status === 'lobby') {
      if (this.sockets().some(ws => this.seatOf(ws))) return;
      this.room.status = 'over';
      await this.save(); await this.publish();
      return;
    }
    if (!G || this.room.status !== 'play' || G.phase !== 'play') return;
    const p = G.active;
    if (G.players[p].ai) {
      let res = this.withEngine(() => engine.act(p, engine.aiNextAction(p)));
      if (!res.ok) res = this.withEngine(() => engine.act(p, { t: 'endTurn' }));
      await this.afterAction(res.events, p, null);
      return;
    }
    if (this.meta.autoEndAt && Date.now() >= this.meta.autoEndAt - 50) {
      this.meta.autoEndAt = null;
      const res = this.withEngine(() => {
        if (!engine.turnIsOver(p)) return null;
        const r = engine.act(p, { t: 'endTurn' });
        if (r.ok) r.events.unshift({ e: 'msg', msg: 'Turn over.' });
        return r;
      });
      if (res && res.ok) { await this.afterAction(res.events, p, null); return; }
      await this.save();
      await this.schedule();
      return;
    }
    if (this.meta.deadline && Date.now() >= this.meta.deadline - 50) {
      const res = this.withEngine(() => {
        const r = engine.act(p, { t: 'endTurn' });
        if (r.ok) r.events.unshift({ e: 'msg', msg: `Time is up for ${engine.seatName(p)}.` });
        return r;
      });
      if (res.ok) await this.afterAction(res.events, p, null);
      return;
    }
    await this.schedule();
  }
}
