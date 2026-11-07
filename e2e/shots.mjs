// README screenshots of the staged Socle extension in a real VS Code: the CDP side.
//
//   node shots.mjs <runDir> <cdpPort> <dark|light> <outDir>
//
// Started in the background by shots.sh. It answers shots.js's numbered requests
// (<runDir>/shots-request-<n>.json -> shots-result-<n>.json), one op each:
//   ready {url, top}   the panel's UI shows `top`, laid out, in this run's theme
//   shot {name}        the window -> <outDir>/<name>.png
//   record-start {name} / record-stop   the window's frames -> <outDir>/frames-<name>/<ms>.png
//   click {url, inst, dbl}  a pointer glides to the instance box in the panel and clicks its header
//                      (selects it), or double-clicks its body (opens it) when `dbl`
//   fsm-open {url}     the same on the FSM block's diagram control
//   fit {url}          the panel's schematic fits its (resized) view
//   surfer {url}       the Surfer tab's UI is ready
//   done               the driver exits
// The CDP helpers follow webview-click.mjs. Screenshots carry no cursor, so the pointer is a small
// arrow drawn in the workbench page where the clicks go.

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [runDir, cdpPort, theme, outDir] = process.argv.slice(2);
const cdp = `http://127.0.0.1:${cdpPort}`;
const t0 = Date.now();
const log = (m) => console.log(`[shots +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

async function until(what, timeoutMs, probe, everyMs = 250) {
  const start = Date.now();
  let last;
  for (;;) {
    try {
      const v = await probe();
      if (v) return v;
    } catch (e) { last = e; }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}${last ? ` (${last.message})` : ''}`);
    await sleep(everyMs);
  }
}

const targets = async () => (await fetch(`${cdp}/json/list`)).json();

function connect(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === undefined) return;
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
    };
    ws.onerror = () => reject(new Error(`cannot connect to ${target.url}`));
    const self = {
      send: (method, params = {}) => new Promise((res, rej) => {
        const n = ++id;
        pending.set(n, { resolve: res, reject: rej, method });
        ws.send(JSON.stringify({ id: n, method, params }));
        setTimeout(() => pending.has(n) && (pending.delete(n), rej(new Error(`${method} timed out`))), 15000);
      }),
    };
    ws.onclose = () => conns.delete(target.id);
    ws.onopen = () => resolve(self);
  });
}
const conns = new Map();
function conn(target) {
  if (!conns.has(target.id)) conns.set(target.id, connect(target).catch((e) => { conns.delete(target.id); throw e; }));
  return conns.get(target.id);
}

async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 60)}...: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

const isPanelUrl = (u, base) => {
  if (!u || !u.startsWith(base)) return false;
  const q = new URL(u).searchParams;
  return q.get('host') === 'vscode' && !q.get('view');
};
const isSurferUrl = (u, base) => !!u && u.startsWith(base) && new URL(u).searchParams.get('view') === 'surfer';

const innerSrc = `(() => {
  const a = document.getElementById('active-frame');
  const f = a && a.contentDocument && a.contentDocument.querySelector('iframe');
  return f ? f.src : null;
})()`;
async function webviewOf(kind, base) {
  for (const t of (await targets()).filter((t) => t.type === 'iframe' && t.url.startsWith('vscode-webview://'))) {
    const c = await conn(t).catch(() => null);
    const src = c && (await evaluate(c, innerSrc).catch(() => null));
    if (kind === 'surfer' ? isSurferUrl(src, base) : isPanelUrl(src, base)) return t;
  }
  return null;
}
const outerFrame = (webview) => `[...document.querySelectorAll('iframe')].find((f) => f.src === ${JSON.stringify(webview.url)})
  || [...document.querySelectorAll('iframe')].find((f) => f.src.startsWith(${JSON.stringify(webview.url.split('?')[0])}))`;
const frameOrigin = (selector) => `(() => {
  const f = ${selector};
  if (!f) return null;
  const r = f.getBoundingClientRect();
  return { x: r.left + f.clientLeft, y: r.top + f.clientTop };
})()`;

/** The UI frame target of the panel or of the Surfer tab. */
async function uiFrame(kind, base) {
  const is = kind === 'surfer' ? isSurferUrl : isPanelUrl;
  const t = await until(`the ${kind} UI frame`, 60000, async () => (await targets()).find((x) => x.type === 'iframe' && is(x.url, base)));
  return conn(t);
}

let wb; // the workbench page
async function workbench() {
  if (!wb) {
    const t = await until('the workbench page', 60000, async () => (await targets()).find((x) => x.type === 'page' && x.url.includes('workbench')));
    wb = await conn(t);
  }
  return wb;
}

// The drawn pointer and its position.
let pointer = { x: 800, y: 500 };
async function drawPointer(x, y) {
  await evaluate(await workbench(), `(() => {
    let p = document.getElementById('readme-pointer');
    if (!p) {
      p = document.createElement('div');
      p.id = 'readme-pointer';
      // DOM calls, not innerHTML: the workbench enforces Trusted Types.
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('viewBox', '0 0 22 22');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M2 2 L2 18 L7 13 L10 20 L13 19 L10 12 L17 12 Z');
      path.setAttribute('fill', 'white'); path.setAttribute('stroke', 'black'); path.setAttribute('stroke-width', '1.5');
      svg.appendChild(path); p.appendChild(svg);
      Object.assign(p.style, { position: 'fixed', zIndex: 2147483647, pointerEvents: 'none' });
      document.body.appendChild(p);
    }
    p.style.left = '${x}px'; p.style.top = '${y}px';
  })()`);
}

/** Glides the pointer to (x, y) in workbench coordinates and clicks there. */
async function glideClick(x, y, dbl = false) {
  const c = await workbench();
  const from = pointer;
  for (let i = 1; i <= 20; i++) {
    const px = from.x + ((x - from.x) * i) / 20, py = from.y + ((y - from.y) * i) / 20;
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
    await drawPointer(px, py);
    await sleep(25);
  }
  pointer = { x, y };
  for (const n of dbl ? [1, 2] : [1]) {
    for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: n });
  }
}

/** Workbench coordinates of the centre of `selector` (its top strip when `header`) in the panel's UI. */
async function panelPoint(base, selector, header) {
  const ui = await uiFrame('panel', base);
  const local = await until(`${selector} in the panel`, 15000, () => evaluate(ui, `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return null;
    const label = ${header} && e.querySelector('[data-box-class]');
    const r = (label && label.getBoundingClientRect().width > 0 ? label : e).getBoundingClientRect();
    return ${header} && !label ? { x: r.left + r.width / 2, y: r.top + 6 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
  const webview = await webviewOf('panel', base);
  const wv = await conn(webview);
  const outer = await evaluate(await workbench(), frameOrigin(outerFrame(webview)));
  const active = await evaluate(wv, frameOrigin(`document.getElementById('active-frame')`));
  const inner = await evaluate(wv, frameOrigin(`document.getElementById('active-frame').contentDocument.querySelector('iframe')`));
  if (!outer || !active || !inner) throw new Error('iframe chain not found');
  return { x: outer.x + active.x + inner.x + local.x, y: outer.y + active.y + inner.y + local.y };
}

async function capture(file) {
  const shot = await (await workbench()).send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
}

let recording = null;
const ops = {
  async ready({ url, top }) {
    const ui = await uiFrame('panel', url);
    const want = theme === 'dark' ? 'dark' : 'light';
    await until(`the panel on ${top}, laid out`, 120000, () => evaluate(ui, `(() =>
      document.querySelector('[data-layout-ready="1"]') && document.querySelector('[data-box-inst]')
      && (document.querySelector('[data-top]') ? document.querySelector('[data-top]').getAttribute('data-top') === ${JSON.stringify(top)} : true))()`));
    const t = await evaluate(ui, `document.documentElement.getAttribute('data-theme') || 'light'`);
    if (t !== want) throw new Error(`panel UI theme ${t}, expected ${want}`);
    return `panel on ${top} in ${t}`;
  },
  async shot({ name }) {
    await drawPointer(-40, -40);
    await capture(join(outDir, `${name}.png`));
    return `${name}.png`;
  },
  async 'record-start'({ name }) {
    const dir = join(outDir, `frames-${name}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await drawPointer(pointer.x, pointer.y);
    const start = Date.now();
    const state = { on: true, n: 0 };
    state.done = (async () => {
      while (state.on) {
        await capture(join(dir, `${String(Date.now() - start).padStart(6, '0')}.png`)).catch(() => {});
        state.n++;
        await sleep(40);
      }
    })();
    recording = state;
    return `recording into ${dir}`;
  },
  async 'record-stop'() {
    recording.on = false;
    await recording.done;
    return `${recording.n} frames`;
  },
  async click({ url, inst, dbl }) {
    // A double-click on the body opens the instance; a click on the header selects it.
    const p = await panelPoint(url, `[data-box-inst="${inst}"]`, !dbl);
    await glideClick(p.x, p.y, !!dbl);
    return `${dbl ? 'double-' : ''}clicked ${inst} at ${Math.round(p.x)},${Math.round(p.y)}`;
  },
  async 'fsm-open'({ url }) {
    const p = await panelPoint(url, '[data-fsm-open]', false);
    await glideClick(p.x, p.y);
    const ui = await uiFrame('panel', url);
    await until('the FSM diagram', 15000, () => evaluate(ui, `!!document.querySelector('[data-fsm-diagram][data-fsm-ready="1"]')`));
    return 'state diagram open';
  },
  async fit({ url }) {
    // The panel's "fit" zoom control (after its group was resized).
    const ui = await uiFrame('panel', url);
    const ok = await evaluate(ui, `(() => {
      const b = [...document.querySelectorAll('button, [role=button], span')].find((e) => e.textContent.trim() === 'fit');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (!ok) throw new Error('no fit control in the panel');
    await sleep(800);
    return 'schematic fitted';
  },
  async surfer({ url }) {
    const sf = await uiFrame('surfer', url);
    const st = await until('Surfer ready (or error)', 240000, async () => {
      const s = await evaluate(sf, `(() => { const e = document.querySelector('[data-surfer-status]'); return e && e.getAttribute('data-surfer-status'); })()`);
      return (s === 'ready' || s === 'error') && s;
    }, 500);
    if (st !== 'ready') throw new Error(`Surfer status ${st}`);
    await until('Surfer idle with a plan', 60000, () => evaluate(sf, `(() => { const s = window.__socleWave && window.__socleWave.snapshot(); return !!(s && s.idle && s.shown); })()`));
    return 'Surfer ready';
  },
};

for (let n = 1; ; n++) {
  const req = join(runDir, `shots-request-${n}.json`);
  const res = join(runDir, `shots-result-${n}.json`);
  await until(`request ${n}`, 3600000, () => existsSync(req), 200);
  const r = JSON.parse(readFileSync(req, 'utf8'));
  let out;
  if (r.op === 'done') out = { ok: true, message: 'bye' };
  else {
    try { out = { ok: true, message: await ops[r.op](r) }; } catch (e) { out = { ok: false, message: e.message }; }
  }
  log(`${r.op}: ${out.ok ? 'ok' : 'FAIL'} ${out.message}`);
  writeFileSync(res + '.tmp', JSON.stringify(out));
  renameSync(res + '.tmp', res);
  if (r.op === 'done') process.exit(0);
}
