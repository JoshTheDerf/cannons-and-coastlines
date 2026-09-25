// Browser smoke tests for the web game, in headless Chromium (Playwright).
// Serves nuxt-site/public itself and drives the real UI code in the 2D view
// (the 3D view needs a GPU): firing at both elevations, collecting at sea,
// Full Sail, picking up the next ship, the dead-ship menu, and the table and
// seating choices. Any console error fails the run.
//
//   npm run ui-smoke                 local games
//   npm run ui-smoke -- --online     also online games, against a local
//                                    `wrangler dev` game server it starts
//
// First run on a new machine: npx playwright install chromium
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../nuxt-site/public/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const online = process.argv.includes('--online');

// ─── Static server for the game (follows the public/ symlinks) ───
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/game/index.html?2d&speed=4`;

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function page(query = '') {
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') pg.errors.push(m.text()); });
  await pg.goto(BASE + query);
  return pg;
}
const myTurn = pg => pg.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'play' && isMyTurn() && !UI.busy, null, { timeout: 30000 });
async function localGame(mode = '#btnSolo', opts = {}) {
  const pg = await page();
  await pg.click(mode);
  for (const [k, v] of Object.entries(opts)) await pg.click(`.optBtn[data-k="${k}"][data-v="${v}"]`);
  await pg.click('#btnStart');
  if (!opts.setup || opts.setup === 'quick') await myTurn(pg);
  return pg;
}
const noErrors = (pg, what) => ok(!pg.errors.length, `${what}: no console errors${pg.errors.length ? ' (' + pg.errors[0] + ')' : ''}`);

// ─── Firing, both elevations, and collecting at sea ───
{
  const pg = await localGame();
  const r = await pg.evaluate(async () => {
    const out = {}, [a, b, c] = G.players[1].ships;
    startFire(a, 'ship'); chooseSlot(1);
    out.buttons = [...document.querySelectorAll('#panel1 .acts button')].map(x => x.textContent);
    setElev('lob'); await releaseShot();
    out.afterLob = { shots: G.stats[1].shots, owesClick: a.stage === 'click' && !a.acted };
    if (UI.mode === 'move') await sailClicks(1);
    startFire(b, 'ship'); chooseSlot(1); setElev('flat'); await releaseShot();
    out.flatShots = G.stats[1].shots;
    if (UI.mode === 'move') await sailClicks(1);
    const t = islands().slice().sort((p, q) => dist(p.x, p.y, c.x, c.y) - dist(q.x, q.y, c.x, c.y))[0];
    t.owner = 1;
    const h = headingTo(c.x - t.x, c.y - t.y), f = fwdVec(h);
    Object.assign(c, { x: t.x + f.x * (t.r + 10), y: t.y + f.y * (t.r + 10), h: normAngle(h + Math.PI / 2) });
    const act = shipActions(c).find(x => x.id === 'collect');
    out.seaLabel = act && act.label;
    UI.sel = c; await doShipAction(act);
    out.afterCollect = { coins: coinTotal(1), sailing: UI.mode === 'move' && c.stage === 'click' };
    return out;
  });
  ok(r.buttons.includes('Straight out') && r.buttons.includes('Tipped up') && r.buttons.includes('Fire!'), 'firing offers Straight out, Tipped up and Fire');
  ok(r.afterLob.shots === 1 && r.afterLob.owesClick, 'a tipped-up shot fires and the ship still owes its click');
  ok(r.flatShots === 2, 'a straight-out shot fires');
  ok(r.seaLabel === 'Collect, then sail' && r.afterCollect.coins >= 1 && r.afterCollect.sailing, 'the nearest ship collects at sea, then must sail');
  noErrors(pg, 'firing and collecting');
}

// ─── Full Sail ───
{
  const pg = await localGame();
  const r = await pg.evaluate(async () => {
    const s = G.players[1].ships[0];
    G.players[1].coins.fullsail = 1; G.players[1].coins.brace = 1; refresh();
    const ring = ringItems(s).map(i => i.label);
    await playCoin('fullsail', s);
    const first = shipActions(s).map(a => a.label);
    startMove(s, 'steer'); await sailClicks(2);
    const mid = { acted: s.acted, coins: coinWindowOpen(1), label: shipActions(s).map(a => a.label)[0] };
    startMove(s, 'steer'); await sailClicks(2);
    return { ring, first, mid, done: { acted: s.acted, coins: coinWindowOpen(1) } };
  });
  ok(r.ring.includes('Full Sail'), 'the ship ring offers Full Sail');
  ok(r.first.length === 1 && /Full Sail, 1 of 2/.test(r.first[0]), 'under Full Sail the only action is to steer and sail (1 of 2)');
  ok(!r.mid.acted && !r.mid.coins && /2 of 2/.test(r.mid.label), 'after the first sail it goes again, with coins locked');
  ok(r.done.acted && r.done.coins, 'after the second sail its turn ends and coins open again');
  noErrors(pg, 'Full Sail');
}

// ─── Picking up the next ship ───
for (const mode of ['#btnSolo', '#btnHotseat']) {
  const pg = await localGame(mode);
  const seen = [];
  for (let k = 0; k < 3; k++) {
    await pg.evaluate(async () => { const s = UI.sel || G.players[G.active].ships.find(x => !x.acted); if (!UI.sel) selectShip(s); startMove(s, 'sail'); await sailClicks(1); });
    await pg.waitForFunction(() => !UI.busy, null, { timeout: 20000 });
    await pg.waitForTimeout(200);
    seen.push(await pg.evaluate(() => ({ sel: UI.sel && UI.sel.id, ring: UI.ring && UI.ring.id, left: G.players[G.active].ships.filter(s => !s.acted).length })));
  }
  ok(seen[0].sel && seen[0].sel === seen[0].ring && seen[1].sel && seen[1].sel !== seen[0].sel && !seen[2].sel, `${mode === '#btnSolo' ? 'against the computer' : 'two on one screen'}: each finished ship hands on to the next, none after the last`);
  noErrors(pg, 'picking up the next ship');
}

// ─── A dead ship: its own guns only ───
{
  const pg = await localGame();
  const r = await pg.evaluate(() => {
    const s = G.players[1].ships[0], t = islands()[0];
    t.owner = 1; Object.assign(s, { x: t.x, y: t.y + t.r + s.wid / 2 + 0.1, h: Math.PI / 2 });
    const live = shipActions(s).map(a => a.label);
    s.fit = 0; s.fitMask = null;
    return { live, dead: shipActions(s).map(a => a.label) };
  });
  ok(r.live.includes('Collect') && r.live.includes('Island gun'), 'a working ship at its island may collect and use the island gun');
  ok(r.dead.join() === 'Fire,Done,Scuttle', `a dead ship may only fire its own guns, pass or scuttle (${r.dead.join(', ')})`);
  noErrors(pg, 'dead ship');
}

// ─── Tables and seating ───
for (const [table, seating, setup, expect] of [['fold8', 'ends', 'quick', 'left,right'], ['round6', 'quarter', 'quick', '90,180'], ['fold6', 'sides', 'quick', 'bottom,top'], ['round6', 'opposite', 'custom', '90,270']]) {
  const pg = await localGame('#btnSolo', { table, seating, setup });
  let deployed = null;
  if (setup === 'custom') {
    await pg.waitForFunction(() => G.phase === 'islands', null, { timeout: 20000 });
    await pg.evaluate(() => { while (G.phase === 'islands' || G.phase === 'terrain') { if (G.phase === 'islands') { if (!randomSetupPiece()) break; } else terrainDone(); } });
    await pg.waitForFunction(() => G.phase === 'deploy' && G.active === 1, null, { timeout: 20000 });
    deployed = await pg.evaluate(() => { const h = seatHome(1), c = tableCenter(); for (const k of [-12, 0, 12]) deployTap({ x: h.x + (c.x - h.x) * 0.05 + k * Math.sin(h.a), y: h.y + (c.y - h.y) * 0.05 - k * Math.cos(h.a) }); return G.players[1].ships.every(s => s.placed); });
  }
  const got = await pg.evaluate(() => (G.table.seats ? G.table.seats.map(s => s.edge) : G.order.map(p => Math.round(seatHome(p).a * 180 / Math.PI))).join());
  ok(got === expect && (deployed === null || deployed), `${table}, ${seating}${setup === 'custom' ? ', set up by hand' : ''}: seats ${got}${deployed ? ', ships deployed by tapping' : ''}`);
  noErrors(pg, `${table} ${seating}`);
}

// ─── Online, against a local game server ───
if (online) {
  const wr = spawn('npx', ['wrangler', 'dev', '--port', '8787', '--var', 'AI_STEP_MS:100'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:8787/health')).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); }
    const pg = await page('&api=http://localhost:8787');
    await pg.click('#btnOnline');
    await pg.selectOption('#olTable', 'fold8');
    await pg.click('#btnCreate');
    await pg.waitForSelector('#addAi', { timeout: 15000 });
    const room = await pg.textContent('.roomCode');
    await pg.click('#addAi'); await pg.waitForTimeout(500); await pg.click('#addAi'); await pg.waitForTimeout(500);
    await pg.click('#readyBtn');
    await pg.waitForSelector('#startBtn:not([disabled])', { timeout: 10000 });
    await pg.click('#startBtn');
    await pg.waitForFunction(() => typeof G !== 'undefined' && G && G.phase === 'play' && NET.online && G.active === NET.seat && !UI.busy, null, { timeout: 30000 });
    const table = await pg.evaluate(() => `${Math.round(G.table.w)}x${Math.round(G.table.h)} ${G.table.seats.map(s => s.edge).join(',')}`);
    ok(/8 ft folding/.test(room) && table.startsWith('244x76'), `online: the host's table choice is used (${table})`);
    await pg.evaluate(async () => { const s = G.players[NET.seat].ships.find(x => !x.acted); selectShip(s); startMove(s, 'sail'); await sailClicks(1); });
    await pg.waitForFunction(() => !UI.busy, null, { timeout: 20000 }); await pg.waitForTimeout(300);
    ok(await pg.evaluate(() => !!(UI.sel && UI.ring && !UI.sel.acted)), 'online: after a ship sails, the next one is picked up');
    noErrors(pg, 'online');
  } finally { try { process.kill(-wr.pid); } catch { /* gone */ } }
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nAll passed');
process.exitCode = fails ? 1 : 0;
