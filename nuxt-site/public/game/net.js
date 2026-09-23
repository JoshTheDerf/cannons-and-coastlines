// Cannons & Coastlines, digital edition: net.js
// Online play: game list, lobby room and the game socket.
// The server (game-server/, a Cloudflare Worker with Durable Objects) runs
// the same rules engine and is the only one that decides anything.
//
// Endpoint: same origin at /game/api by default. For local development
// use ?api=http://localhost:8787/game/api (it is remembered).

const NET = {
  online: false, seat: null, code: null, token: null, ws: null, room: null,
  deadline: null, away: [], lastSeq: 0, reqId: 0, pending: new Map(),
  queue: [], processing: false, lobbyWs: null, retry: 0, closing: false, games: [],

  api() {
    const q = new URLSearchParams(location.search).get('api');
    if (q) { try { localStorage.setItem('cc-api', q); } catch (e) {} return q.replace(/\/$/, ''); }
    let saved = null;
    try { saved = localStorage.getItem('cc-api'); } catch (e) {}
    return (saved || location.origin + '/game/api').replace(/\/$/, '');
  },
  wsUrl(path) { return this.api().replace(/^http/, 'ws') + path; },
  name() { try { return localStorage.getItem('cc-name') || ''; } catch (e) { return ''; } },
  setName(n) { try { localStorage.setItem('cc-name', n); } catch (e) {} },
  tokenFor(code) { try { return localStorage.getItem('cc-token-' + code); } catch (e) { return null; } },
  saveToken(code, t) { try { localStorage.setItem('cc-token-' + code, t); } catch (e) {} },

  boot() {
    const q = new URLSearchParams(location.search);
    const code = q.get('game');
    if (code) { showOnline(true); this.join(code.toUpperCase()); }
    else if (q.has('online')) showOnline(); // /game/?online opens the game list
  },

  // ─── Game list ────────────────────────────────────
  openLobby() {
    this.closeLobby();
    let ws;
    try { ws = new WebSocket(this.wsUrl('/lobby')); } catch (e) { renderGameList(null, 'Could not reach the game server.'); return; }
    this.lobbyWs = ws;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.type === 'games') { this.games = m.games; renderGameList(m.games); }
    };
    ws.onerror = () => renderGameList(null, 'Could not reach the game server.');
    ws.onclose = () => { if (this.lobbyWs === ws) { this.lobbyWs = null; setTimeout(() => { if ($('onlineScreen').style.display === 'flex') this.openLobby(); }, 3000); } };
  },
  closeLobby() { if (this.lobbyWs) { const w = this.lobbyWs; this.lobbyWs = null; w.close(); } },

  async create(settings) {
    const r = await fetch(this.api() + '/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    if (!r.ok) throw new Error((await r.text()) || 'Could not create the game.');
    const { code } = await r.json();
    this.join(code);
  },

  // ─── Game socket ──────────────────────────────────
  join(code) {
    this.closeLobby();
    this.leave(true);
    this.code = code; this.closing = false; this.retry = 0; this.lastSeq = 0;
    this.token = this.tokenFor(code);
    history.replaceState(null, '', location.pathname + '?game=' + code + (new URLSearchParams(location.search).get('api') ? '&api=' + encodeURIComponent(this.api()) : ''));
    this.connect();
  },

  connect() {
    const ws = new WebSocket(this.wsUrl('/games/' + this.code + '/ws'));
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify({ type: 'hello', token: this.token, name: this.name() || 'Captain' })); setNetStatus(''); };
    ws.onmessage = ev => { this.queue.push(JSON.parse(ev.data)); this.process(); };
    ws.onclose = ev => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const [, r] of this.pending) r({ ok: false, err: 'Connection lost.' });
      this.pending.clear();
      if (this.closing) return;
      if (ev.code === 4404) { this.online = false; alertOnline('No game with that code.'); return; }
      // Reconnect with a growing pause. The token gets the same seat back.
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setNetStatus('Reconnecting...');
      setTimeout(() => { if (!this.closing && this.code) this.connect(); }, wait);
    };
  },

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },

  leave(silent) {
    if (this.ws) {
      this.closing = true;
      if (!silent) this.send({ type: 'leave' });
      const w = this.ws; this.ws = null;
      try { w.close(1000); } catch (e) {}
    }
    this.online = false; this.seat = null; this.room = null; this.deadline = null;
    this.queue = []; this.pending.clear();
    if (!silent) { this.code = null; history.replaceState(null, '', location.pathname); }
  },

  request(a) {
    return new Promise(resolve => {
      if (!this.ws) { resolve({ ok: false, err: 'Not connected.' }); return; }
      const id = ++this.reqId;
      this.pending.set(id, resolve);
      this.send({ type: 'action', id, a });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ ok: false, err: 'The server did not answer.' }); } }, 20000);
    });
  },

  async process() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) await this.handle(this.queue.shift());
    } catch (err) { console.error(err); }
    this.processing = false;
  },

  async handle(m) {
    switch (m.type) {
      case 'welcome':
        this.seat = m.seat; this.token = m.token;
        if (m.token) this.saveToken(this.code, m.token);
        break;
      case 'room':
        this.room = m.room;
        if (m.room.status === 'lobby') { this.online = false; renderRoom(); }
        break;
      case 'presence':
        this.away = m.away || [];
        if (G && this.online) refresh();
        if (this.room && this.room.status === 'lobby') { this.room.seats.forEach(s => { s.connected = !this.away.includes(s.seat); }); renderRoom(); }
        break;
      case 'state': {
        this.lastSeq = m.seq; this.deadline = m.deadline || null; this.away = m.away || this.away;
        const first = !this.online;
        this.online = true;
        G = m.game;
        if (first || $('game').style.display === 'none') enterGameScreen();
        resyncUI(); refresh();
        if (G.phase === 'over') showGameOver();
        else if (first) announceTurn();
        break;
      }
      case 'events': {
        const was = G && G.active;
        if (G && this.online && m.seq === this.lastSeq + 1) {
          UI.busy = true;
          try { await playEvents(m.events); } finally { UI.busy = false; }
        }
        this.lastSeq = m.seq; this.deadline = m.deadline || null;
        G = m.game;
        const r = m.id != null && m.by === this.seat ? this.pending.get(m.id) : null;
        if (r) this.pending.delete(m.id);
        if (G.active !== was) { UI.sel = null; cancelMode(); }
        resyncUI(); refresh();
        if (r) r({ ok: true, events: m.events });
        if (m.events.some(e => e.e === 'over') || G.phase === 'over') setTimeout(showGameOver, 600);
        else if (m.events.some(e => e.e === 'turn')) announceTurn();
        break;
      }
      case 'error': {
        const r = m.id != null ? this.pending.get(m.id) : null;
        if (r) { this.pending.delete(m.id); r({ ok: false, err: m.msg }); }
        else alertOnline(m.msg);
        break;
      }
    }
  },

  tickTimer() {
    const el = document.getElementById('turnTimer');
    if (!el) return;
    if (!this.deadline || !G || G.phase !== 'play') { el.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('low', s <= 15); }
  },

  link() { return location.origin + location.pathname + '?game=' + this.code; },
  copyLink() {
    const l = this.link();
    (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => logMsg('Link copied.'), () => prompt('Game link', l));
  },
};

// ═══ Online screens ════════════════════════════════════

function setNetStatus(t) { const el = $('netStatus'); if (el) { el.textContent = t; el.style.display = t ? 'block' : 'none'; } }
function alertOnline(msg) {
  const el = $('onlineMsg');
  if (el && $('onlineScreen').style.display === 'flex') { el.textContent = msg; el.style.display = 'block'; }
  else logMsg(msg);
}

function showOnline(noList) {
  NET.leave(true);
  G = null;
  showScreen('onlineScreen');
  $('onlineMsg').style.display = 'none';
  $('olName').value = NET.name();
  renderGameList(null, noList ? 'Joining...' : 'Looking for games...');
  if (!noList) NET.openLobby();
}

function onlineName() {
  const n = $('olName').value.trim().slice(0, 20);
  if (n) NET.setName(n);
  return n || 'Captain';
}

async function createOnline() {
  onlineName();
  const settings = {
    name: $('olGameName').value.trim().slice(0, 32) || `${onlineName()}'s game`,
    maxPlayers: +$('olMax').value, timer: +$('olTimer').value,
  };
  try { await NET.create(settings); } catch (e) { alertOnline('Could not create the game. Is the game server running?'); }
}

function joinByCode() {
  onlineName();
  const code = $('olCode').value.trim().toUpperCase();
  if (code.length >= 4) NET.join(code);
}

function renderGameList(games, note) {
  const el = $('olList');
  if (!el) return;
  if (!games) { el.innerHTML = `<p class="olEmpty">${esc(note || '')}</p>`; return; }
  if (!games.length) { el.innerHTML = '<p class="olEmpty">No open games right now. Start one.</p>'; return; }
  el.innerHTML = `<table class="bookTable"><tr><th>Game</th><th>Crews</th><th>Status</th><th></th></tr>${games.map(g => `
    <tr><td><b>${esc(g.name)}</b><br><small>${esc(g.code)}</small></td><td>${g.players}/${g.max}</td>
    <td>${g.status === 'lobby' ? 'In the lobby' : 'Playing'}</td>
    <td><button class="actBtn go" data-join="${esc(g.code)}">${g.status === 'lobby' && g.players < g.max ? 'Join' : 'Watch'}</button></td></tr>`).join('')}</table>`;
  el.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { onlineName(); NET.join(b.dataset.join); });
}

function renderRoom() {
  const R = NET.room;
  if (!R) return;
  showScreen('roomScreen');
  $('roomTitle').textContent = R.name;
  const me = R.seats.find(s => s.seat === NET.seat);
  const host = R.host === NET.seat;
  const taken = new Set(R.seats.filter(s => s !== me).map(s => s.color));
  const humansReady = R.seats.filter(s => !s.ai).every(s => s.ready);
  const canStart = host && R.seats.length >= 2 && humansReady;
  $('roomBody').innerHTML = `
    <p class="roomCode">Code <b>${esc(R.code)}</b> · Rulebook ${RULES_VERSION} · ${R.timer ? R.timer + 's turns' : 'no turn timer'}</p>
    <div class="setupLabel">Crews (${R.seats.length}/${R.max})</div>
    <div class="seatList">${R.seats.map(s => `
      <div class="seatRow" style="--pc:${PALETTE[s.color].main}">
        <span class="pDot"></span>
        <span class="seatName">${esc(s.name)}${s.seat === NET.seat ? ' (you)' : ''}${s.seat === R.host ? ' · host' : ''}${s.ai ? ' · computer' : ''}${!s.ai && s.connected === false ? ' · away' : ''}</span>
        <span class="seatFac">${esc((FACTION_DEFS[factionId(s.faction)] || { name: s.faction || '' }).name)}</span>
        <span class="seatReady">${s.ai || s.ready ? 'Ready' : 'Not ready'}</span>
        ${host && s.ai ? `<button class="actBtn" data-kick="${s.seat}">Remove</button>` : ''}
      </div>`).join('')}</div>
    ${R.spectators ? `<p class="olEmpty">${R.spectators} watching.</p>` : ''}
    ${me ? `
      <div class="setupLabel">Your fleet</div>
      <div class="fRow">${FACTION_ORDER.map(fid => factionCard(fid, me.faction === fid, `data-fac="${fid}"`)).join('')}</div>
      <div class="setupLabel">Your colour</div>
      <div class="swatches">${PALETTE.map((c, i) => `<button class="swatch${me.color === i ? ' on' : ''}" data-col="${i}" style="--sw:${c.main}" ${taken.has(i) ? 'disabled' : ''} title="${c.name}">${c.name}</button>`).join('')}</div>`
      : '<p class="callout">You are watching this game. Seats are full or the game has started.</p>'}
    <div class="setupBtns">
      <button onclick="NET.leave(); showOnline()">Leave</button>
      <button onclick="NET.copyLink()">Copy link</button>
      ${host && R.seats.length < R.max ? '<button id="addAi">Add computer</button>' : ''}
      ${me ? `<button id="readyBtn" class="${me.ready ? '' : 'primary'}">${me.ready ? 'Not ready' : 'Ready'}</button>` : ''}
      ${host ? `<button id="startBtn" class="primary" ${canStart ? '' : 'disabled'}>Start</button>` : ''}
    </div>
    ${host && !canStart ? '<p class="olEmpty">Start opens when there are 2 or more crews and every player is ready.</p>' : ''}`;
  const q = s => $('roomBody').querySelectorAll(s);
  q('[data-fac]').forEach(b => b.onclick = () => NET.send({ type: 'seat', faction: b.dataset.fac }));
  q('[data-col]').forEach(b => b.onclick = () => NET.send({ type: 'seat', color: +b.dataset.col }));
  q('[data-kick]').forEach(b => b.onclick = () => NET.send({ type: 'kick', seat: +b.dataset.kick }));
  if ($('addAi')) $('addAi').onclick = () => NET.send({ type: 'addAI' });
  if ($('readyBtn')) $('readyBtn').onclick = () => NET.send({ type: 'ready', ready: !me.ready });
  if ($('startBtn')) $('startBtn').onclick = () => NET.send({ type: 'start' });
}
