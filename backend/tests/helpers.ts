import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createBackend, type Backend, type CreateBackendOptions } from '@/index';
import type { Device } from '@/common/http/types';
import { fingerprint, keyPair, requestMessage, sign } from '@/common/utils/crypto';

export interface TestDevice extends Device {
  privateKey: string;
}

export interface SendResult {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Record<string, string>;
}

export interface TestApp {
  backend: Backend;
  origin: string;
  dir: string;
  dbPath: string;
  backupKeyHex: string;
  internal: TestDevice;
  gate: TestDevice;
  send: (
    device: TestDevice,
    method: 'GET' | 'POST',
    route: string,
    data?: unknown,
    token?: string,
    requestId?: string,
    override?: Record<string, string>,
  ) => Promise<SendResult>;
  login: (device: TestDevice, username: string, password: string) => Promise<string>;
  /** Signed call as the admin on the internal device; asserts a 2xx answer. */
  api: (method: 'GET' | 'POST', route: string, data?: unknown, id?: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  adminToken: string;
  close: () => Promise<void>;
}

export const ADMIN_PASSWORD = 'test-password-long';
export const serverId = 'installation-test';

export function newDevice(kind: 'internal' | 'gate'): TestDevice {
  const keys = keyPair();
  return { id: randomUUID(), kind, ...keys, fingerprint: fingerprint(keys.publicKey) };
}

/** Starts a real backend (SQLite file in a temp dir) behind an HTTP server on a random port. */
export async function createTestApp(
  t: TestContext,
  options: Partial<CreateBackendOptions> & { withBackups?: boolean; dir?: string } = {},
): Promise<TestApp> {
  const dir = options.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'mil-backend-'));
  const internal = newDevice('internal');
  const gate = newDevice('gate');
  const backupKeyHex = randomBytes(32).toString('hex');
  const clock = options.clock ?? Date.now;
  const dbPath = path.join(dir, 'data', 'app.db');
  const { withBackups = true, dir: _dir, ...rest } = options;
  const backend = await createBackend({
    dbPath,
    serverId,
    licenseProvider: () => ({ installation: 'وحدة اختبار', devices: [internal, gate] }),
    admin: { username: 'admin', name: 'مسؤول', password: ADMIN_PASSWORD },
    ...(withBackups ? { backupKeyHex, backupDirectory: path.join(dir, 'backups') } : {}),
    ...rest,
  });
  const server = http.createServer(backend.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await backend.shutdown();
    if (!options.dir) fs.rmSync(dir, { recursive: true, force: true });
  };
  t.after(close);

  const send: TestApp['send'] = async (device, method, route, data = {}, token, requestId, override = {}) => {
    const body = method === 'GET' ? '' : JSON.stringify(data);
    const timestamp = String(clock());
    const nonce = randomUUID();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': device.id,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': sign(
        device.privateKey,
        requestMessage({ deviceId: device.id, timestamp, nonce, method, path: route, body }),
      ),
      ...override,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (requestId) headers['X-Request-Id'] = requestId;
    else if (method === 'POST') headers['X-Request-Id'] = randomUUID();
    const response = await fetch(origin + route, { method, headers, ...(method === 'GET' ? {} : { body }) });
    return { status: response.status, body: await response.json(), headers };
  };
  const login: TestApp['login'] = async (device, username, password) => {
    const result = await send(device, 'POST', '/api/login', { username, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.token as string;
  };
  const adminToken = await login(internal, 'admin', ADMIN_PASSWORD);
  const api: TestApp['api'] = async (method, route, data = {}, id) => {
    const res = await send(internal, method, route, data, app.adminToken, id);
    assert.ok(res.status < 300, `${method} ${route}: ${JSON.stringify(res)}`);
    return res.body;
  };
  const app: TestApp = {
    backend,
    origin,
    dir,
    dbPath,
    backupKeyHex,
    internal,
    gate,
    send,
    login,
    api,
    adminToken,
    close,
  };
  return app;
}
