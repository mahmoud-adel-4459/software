'use strict';
/**
 * Real end-to-end test of the packaged desktop app: starts Electron (play mode, throw-away profile),
 * drives the renderer over the Chrome DevTools protocol and checks login, soldier creation, QR,
 * the gate cycle with its log, documents and logout.
 *
 *   npm run test:electron
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const PORT = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'military-e2e-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(deadline) {
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch {
      // Electron is still starting.
    }
    await sleep(500);
  }
  throw new Error('Electron window did not open in time');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    };
    socket.onerror = reject;
    socket.onopen = () =>
      resolve({
        close: () => socket.close(),
        /** Evaluates an async expression inside the renderer and returns its JSON value. */
        async run(expression) {
          // The page may still be creating its JS context right after launch: retry transient protocol errors.
          for (let attempt = 0; attempt < 20; attempt++) {
            const id = nextId++;
            const reply = new Promise((done) => pending.set(id, done));
            socket.send(
              JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: { expression, awaitPromise: true, returnByValue: true },
              }),
            );
            const message = await reply;
            if (!message.result) {
              await sleep(500);
              continue;
            }
            const { result } = message;
            if (result.exceptionDetails)
              throw new Error(result.exceptionDetails.exception?.description || 'renderer error');
            return result.result.value;
          }
          throw new Error('renderer did not become ready');
        },
      });
  });
}

async function main() {
  const env = { ...process.env, MILITARY_AFFAIRS_PLAY: '1', MILITARY_AFFAIRS_USER_DATA: PROFILE };
  delete env.ELECTRON_RUN_AS_NODE; // set by some terminals; would start plain Node instead of Electron
  // E2E_EXECUTABLE=<path to the packaged .exe> tests the installed build instead of the dev checkout.
  const packaged = process.env.E2E_EXECUTABLE;
  const electronBinary = packaged || require('electron');
  const app = spawn(
    electronBinary,
    packaged ? [`--remote-debugging-port=${PORT}`] : [`--remote-debugging-port=${PORT}`, '.', '--', '--play'],
    {
      cwd: ROOT,
      env,
      stdio: 'ignore',
    },
  );
  let failed = false;
  try {
    const target = await waitForTarget(Date.now() + 90000);
    const page = await connect(target.webSocketDebuggerUrl);
    const call = (expr) => page.run(`(async()=>JSON.stringify(await (${expr})))()`).then((v) => JSON.parse(v));
    const desktop = (method, ...args) =>
      call(`window.desktop.${method}(${args.map((a) => JSON.stringify(a)).join(',')})`);
    const ok = (result, label) => {
      assert.equal(result.ok, true, `${label}: ${result.error}`);
      return result.data;
    };

    const info = ok(await desktop('info'), 'info');
    assert.equal(info.playMode, true);
    const password = fs
      .readFileSync(path.join(PROFILE, 'standalone', 'login.txt'), 'utf8')
      .match(/Password: (.+)/)[1]
      .trim();

    const session = ok(await desktop('login', { username: 'admin', password }), 'login');
    assert.equal(session.user.role, 'admin');
    assert.equal(session.kind, 'internal');
    const catalog = ok(await desktop('request', 'GET', '/api/catalog'), 'catalog');
    assert.ok(catalog.exitReasons.length > 10);

    const soldier = ok(
      await desktop(
        'request',
        'POST',
        '/api/soldiers',
        {
          name: 'اختبار إلكترون',
          militaryNo: '000099001',
          nationalId: '30101010101099',
          rank: 'جندي',
          company: 'الأولى',
          unit: 'وحدة',
        },
        randomUUID(),
      ),
      'create soldier',
    );
    const qr = ok(await desktop('qr', soldier.id), 'qr');
    assert.match(qr, /^data:image\/png;base64,/);

    const visitor = ok(
      await desktop(
        'request',
        'POST',
        '/api/visitors',
        { name: 'زائر اختبار', categoryId: '00000000-0000-0000-0000-000000000020' },
        randomUUID(),
      ),
      'create visitor',
    );
    assert.ok(ok(await desktop('qrVisitor', visitor.id), 'visitor qr').startsWith('data:image/png;base64,'));
    ok(
      await desktop('document', { type: 'visitor-qr', ids: [visitor.id], copies: 1, mode: 'preview' }),
      'visitor-qr document preview',
    );
    for (const type of ['qr', 'card']) {
      ok(
        await desktop('document', { type, ids: [soldier.id], copies: 1, mode: 'preview' }),
        type + ' document preview',
      );
    }
    const scanned = ok(await desktop('request', 'GET', '/api/gate/soldier?militaryNo=000099001'), 'gate scan');
    assert.equal(scanned.soldier.id, soldier.id);
    const exit = ok(
      await desktop(
        'request',
        'POST',
        '/api/gate',
        {
          soldierId: soldier.id,
          kind: 'exit',
          reason: 'إجازة اعتيادية',
          expectedReturn: new Date(Date.now() + 3600000).toISOString(),
          notes: 'e2e',
        },
        randomUUID(),
      ),
      'gate exit',
    );
    ok(
      await desktop(
        'request',
        'POST',
        '/api/gate',
        { soldierId: soldier.id, kind: 'entry', notes: 'e2e' },
        randomUUID(),
      ),
      'gate entry',
    );
    const today = new Date().toISOString().slice(0, 10);
    const log = ok(await desktop('request', 'GET', `/api/reports?type=gate&from=${today}&to=${today}`), 'gate log');
    assert.deepEqual(
      log.rows
        .filter((r) => r.military_no === '000099001')
        .map((r) => r.kind)
        .sort(),
      ['entry', 'exit'],
    );
    const permitView = ok(await desktop('request', 'GET', `/api/permit?id=${exit.id}`), 'permit view');
    for (const key of ['no', 'name', 'rank', 'military_no', 'company', 'reason', 'exit_at', 'expected_return'])
      assert.ok(permitView[key] !== undefined && permitView[key] !== null && permitView[key] !== '', 'permit field ' + key);
    ok(await desktop('document', { type: 'voucher', id: exit.id, mode: 'preview' }), 'voucher preview');

    // Outlet add -> delete, dashboard, and a bulk soldier import through the allow-listed API.
    const outlet = ok(
      await desktop('request', 'POST', '/api/outlets', { name: 'نقطة اختبار', kind: 'canteen' }, randomUUID()),
      'create outlet',
    );
    ok(await desktop('request', 'POST', '/api/outlets/delete', { id: outlet.id }, randomUUID()), 'delete outlet');
    const dash = ok(await desktop('request', 'GET', '/api/dashboard?days=30'), 'dashboard');
    assert.equal(dash.range.days, 30);
    assert.equal(dash.gate.byDay.length, 30);
    const imported = ok(
      await desktop(
        'request',
        'POST',
        '/api/soldiers/import',
        {
          rows: [
            {
              name: 'مستورد 1',
              militaryNo: 880001,
              nationalId: 30101010101101,
              rank: 'جندي',
              company: 'الأولى',
              unit: 'وحدة',
            },
            {
              name: 'مستورد 2',
              militaryNo: '000099001',
              nationalId: '30101010101102',
              rank: 'جندي',
              company: 'الأولى',
              unit: 'وحدة',
            },
          ],
        },
        randomUUID(),
      ),
      'import soldiers',
    );
    assert.equal(imported.created, 1);
    assert.equal(imported.skipped, 1);
    assert.equal(imported.errors[0].row, 2);
    for (const fn of ['excelExport', 'excelTemplate', 'excelImport']) {
      assert.equal(await call(`typeof window.desktop.${fn}`), 'function', fn);
    }

    const blocked = await desktop('request', 'GET', '/api/not-allowed');
    assert.equal(blocked.ok, false, 'paths outside the allow-list must be rejected');
    ok(await desktop('logout'), 'logout');
    assert.equal((await desktop('request', 'GET', '/api/catalog')).ok, false, 'no requests after logout');
    page.close();
    console.log('ELECTRON E2E PASSED');
  } catch (error) {
    failed = true;
    console.error('ELECTRON E2E FAILED:', error.message);
  } finally {
    spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(1500);
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
