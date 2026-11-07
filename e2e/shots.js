// README screenshots of the staged Socle extension in a real VS Code: the story side.
// VS Code loads this file through --extensionTestsPath (see shots.sh) and calls run(); it drives
// the editor and the extension, and asks shots.mjs (the CDP driver, over files in $SOCLE_E2E_DIR)
// to click in the panel, take stills and record the hero's frames.
// Plain CommonJS: only Node built-ins and the `vscode` module VS Code provides.

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vscode = require('vscode');

const PIPE_SPEC = 'example/test/src/rvpipeline/RVPipelineSpec.scala';
const PIPE_TEST = 'RVPipeline should run a few cycles after reset';
const PIPE_FILE = 'example/src/rvpipeline/RVPipeline.scala';
const FSM_SPEC = 'example/test/src/fsm/TrafficFsmSpec.scala';
const FSM_TEST = 'TrafficFsm cycles red, green, yellow';
const FSM_FILE = 'example/src/fsm/TrafficFsm.scala';

const t0 = Date.now();
const log = (m) => console.log(`[shots +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(what, timeoutMs, probe, everyMs = 500) {
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

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const root = () => vscode.workspace.workspaceFolders[0].uri.fsPath;

async function openEditor(rel, line) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root(), rel)));
  const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  if (line !== undefined) at(ed, line);
  return ed;
}

/** Puts the cursor at the start of `line` (0-based) and shows it near the top. */
function at(ed, line) {
  ed.selection = new vscode.Selection(line, 0, line, 0);
  ed.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
}

/** The 0-based line of the first line matching `re` in a workspace file. */
function lineOf(rel, re) {
  const i = fs.readFileSync(path.join(root(), rel), 'utf8').split('\n').findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`${re} not in ${rel}`);
  return i;
}

/** Runs a test's lens (`View design` or `Simulate`) on a spec. */
async function lens(spec, title, test) {
  const uri = vscode.Uri.file(path.join(root(), spec));
  await openEditor(spec);
  let seen = [];
  const l = await poll(`a "${title}" lens for ${test}`, 120000, async () => {
    const all = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 10)) || [];
    seen = all.map((x) => x.command && `${x.command.title}: ${JSON.stringify(x.command.arguments)}`);
    return all.find((x) => x.command && x.command.title === title && x.command.arguments[2] === test);
  }).catch((e) => { throw new Error(`${e.message}; lenses: ${seen.join(' | ')}`); });
  await vscode.commands.executeCommand(l.command.command, ...(l.command.arguments || []));
}

/** One op of shots.mjs: writes shots-request-<n>.json, waits for its result. */
let ops = 0;
async function driver(op, args = {}, timeoutMs = 60000) {
  const dir = process.env.SOCLE_E2E_DIR;
  const n = ++ops;
  const req = path.join(dir, `shots-request-${n}.json`);
  const res = path.join(dir, `shots-result-${n}.json`);
  fs.writeFileSync(req + '.tmp', JSON.stringify({ op, ...args }));
  fs.renameSync(req + '.tmp', req);
  const r = await poll(`${op} from shots.mjs`, timeoutMs, () => fs.existsSync(res) && JSON.parse(fs.readFileSync(res, 'utf8')));
  if (!r.ok) throw new Error(`shots.mjs ${op}: ${r.message}`);
  log(`  ${op}: ${r.message}`);
  return r;
}

const isWebview = (t, viewType) => !!t && t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith(viewType);
const tabOf = (viewType) => vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => isWebview(t, viewType));

/** Makes sure the Surfer tab is in a group below the Socle panel, so the waveforms sit under the
  * schematic. Simulate opens it there; this also covers an older build that opened it beside. */
async function surferBelowPanel() {
  const names = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
  const panel = await poll('the Socle panel tab', 10000, () => tabOf('socle.panel'));
  const surfer = await poll('the Surfer tab', 10000, () => tabOf('socle.surfer'));
  await vscode.commands.executeCommand(`workbench.action.focus${names[surfer.group.viewColumn - 1]}EditorGroup`);
  await poll('the Surfer tab active', 10000, () => isWebview(vscode.window.tabGroups.activeTabGroup.activeTab, 'socle.surfer'));
  // Into the panel's group, then split down from it.
  while (tabOf('socle.surfer').group.viewColumn > panel.group.viewColumn) {
    await vscode.commands.executeCommand('workbench.action.moveEditorToPreviousGroup');
    await sleep(500);
  }
  await vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
  await sleep(1500);
  log(`  groups: ${vscode.window.tabGroups.all.map((g) => `${g.viewColumn}[${g.tabs.map((t) => t.label).join(', ')}]`).join(' ')}`);
}

async function step(name, f) {
  log(`START ${name}`);
  const v = await f();
  log(`DONE  ${name}`);
  return v;
}

async function run() {
  const theme = process.env.SOCLE_SHOTS_THEME;
  log(`workspace ${root()}, theme ${theme}`);
  // Room for the code, the panel and Surfer: no side bars.
  for (const c of ['workbench.action.closeAuxiliaryBar', 'workbench.action.closeSidebar']) {
    await vscode.commands.executeCommand(c).then(() => {}, () => {});
  }

  const url = await step('view the RV pipeline', async () => {
    await lens(PIPE_SPEC, 'View design', PIPE_TEST);
    const u = await poll('socle._panelUrl', 180000, () => vscode.commands.executeCommand('socle._panelUrl'));
    await poll('design.json with top RVPipeline', 600000, async () => (await getJson(u + 'design.json')).top === 'RVPipeline', 1000);
    return u;
  });
  const focus = (cls) => poll(`ide.json focusClass == ${cls}`, 30000, async () => (await getJson(url + 'ide.json')).focusClass === cls);
  const classLine = (name) => lineOf(PIPE_FILE, new RegExp(`^class ${name} extends Module`));

  await step('schematic still: the cursor in class Exec', async () => {
    await vscode.commands.executeCommand('notifications.clearAll');
    await openEditor(PIPE_FILE, classLine('Exec'));
    await focus('rvpipeline.Exec');
    await driver('ready', { url, top: 'RVPipeline' });
    await sleep(1000);
    await driver('shot', { name: `schematic-${theme}` });
  });

  await step('hero: the cursor walks the stages, a click jumps to code, the FSM diagram', async () => {
    const ed = await openEditor(PIPE_FILE, classLine('Fetch'));
    await focus('rvpipeline.Fetch');
    await sleep(800);
    await driver('record-start', { name: `hero-${theme}` });
    await sleep(1200);
    for (const s of ['Decode', 'Exec', 'WB']) {
      at(ed, classLine(s));
      await focus(`rvpipeline.${s}`);
      await sleep(1300);
    }
    // A click on the fetch box jumps the editor to its code.
    await driver('click', { url, inst: 'fetch' });
    await poll('the editor on class Fetch', 10000, () => {
      const e = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
      return e && Math.abs(e.selection.active.line - classLine('Fetch')) <= 2;
    }).catch(() => log('  (the editor did not land on class Fetch)'));
    await sleep(1500);
    await lens(FSM_SPEC, 'View design', FSM_TEST);
    await poll('design.json with top TrafficFsm', 600000, async () => (await getJson(url + 'design.json')).top === 'TrafficFsm', 1000);
    await openEditor(FSM_FILE, lineOf(FSM_FILE, /switch\(state\)/) - 7);
    await driver('ready', { url, top: 'TrafficFsm' });
    await sleep(900);
    await driver('fsm-open', { url });
    await sleep(2400);
    await driver('record-stop');
  });

  await step('fsm still: the state diagram beside TrafficFsm.scala', async () => {
    await sleep(500);
    await driver('shot', { name: `fsm-${theme}` });
  });

  await step('waves still: Simulate, Surfer follows the selection', async () => {
    await vscode.workspace.getConfiguration('socle').update('waveViewer', 'surfer-panel', vscode.ConfigurationTarget.Global);
    await poll('ide.json waveViewer == surfer-panel', 30000, async () => (await getJson(url + 'ide.json')).waveViewer === 'surfer-panel');
    await lens(PIPE_SPEC, 'Simulate', PIPE_TEST);
    const traceTest = `rvpipeline.RVPipelineSpec#${PIPE_TEST}`;
    // A cold Verilator build of the test takes minutes.
    const ide = await poll('ide.json with the RV pipeline trace', 900000, async () => {
      const j = await getJson(url + 'ide.json');
      return j.trace && j.status !== 'simulating' && j;
    }, 2000);
    log(`  trace ${ide.trace} of ${ide.traceTest} (${ide.status}: ${ide.message})`);
    if (ide.traceTest !== traceTest) log(`  (traceTest ${ide.traceTest}, expected ${traceTest})`);
    await poll('design.json with top RVPipeline', 120000, async () => (await getJson(url + 'design.json')).top === 'RVPipeline', 1000);
    await openEditor(PIPE_FILE, classLine('Exec'));
    await driver('surfer', { url }, 300000);
    await surferBelowPanel();
    await driver('surfer', { url }, 120000);
    await driver('fit', { url });
    // The code group active, so the click's code opens there and not over Surfer.
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    await sleep(500);
    await vscode.commands.executeCommand('notifications.clearAll');
    // Selecting exec focuses its signals in Surfer.
    await driver('click', { url, inst: 'exec' });
    await sleep(1500);
    await driver('surfer', { url }, 60000);
    await sleep(1500);
    await driver('shot', { name: `waves-${theme}` });
  });

  await driver('done');
}

module.exports = { run };
