import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalWaitSources, parseProcStatStartTime } from '../wait-local.mjs';

function record(condition, baseline) {
  return { condition, baseline };
}

test('process_exit arms with proc start-time identity and matches after the process exits', async () => {
  const child = spawn('sleep', ['0.15'], { stdio: 'ignore' });
  const source = new LocalWaitSources({ defaultCwd: process.cwd() });
  const condition = { kind: 'process_exit', pid: child.pid };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal(armed.baseline.pid, child.pid);
  assert.match(armed.baseline.startTimeTicks, /^\d+$/);

  await once(child, 'exit');
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
  assert.match(result.evidence, new RegExp(`pid=${child.pid}`));
});

test('process_exit is immediately matched when the PID is already absent at arm time', async () => {
  const source = new LocalWaitSources({ defaultCwd: process.cwd() });
  const condition = { kind: 'process_exit', pid: 99999999 };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'matched');
  assert.equal(armed.baseline.pid, 99999999);
  assert.equal(armed.baseline.startTimeTicks, null);
});

test('proc stat parser handles command names containing spaces and parentheses', () => {
  const line = '123 (worker name (nested)) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 424242 20 21';
  assert.equal(parseProcStatStartTime(line), '424242');
});

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-dev-wait-local-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return port;
}

test('tcp_listen is pending while closed and matches once a local server listens', async (t) => {
  const source = new LocalWaitSources({ defaultCwd: process.cwd() });
  const port = await freePort();
  const condition = { kind: 'tcp_listen', host: '127.0.0.1', port };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');

  const server = net.createServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
  assert.match(result.evidence, new RegExp(`127\\.0\\.0\\.1:${port}`));
});

test('file_exists is pending while absent and matches after creation', async (t) => {
  const dir = await tempDir(t);
  const source = new LocalWaitSources({ defaultCwd: dir });
  const condition = { kind: 'file_exists', path: 'ready.flag' };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal(armed.baseline.path, path.join(dir, 'ready.flag'));
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');

  await fs.writeFile(path.join(dir, 'ready.flag'), 'ready\n');
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
});

test('file_changed records an existing-file baseline and matches modification', async (t) => {
  const dir = await tempDir(t);
  const target = path.join(dir, 'watched.txt');
  await fs.writeFile(target, 'before\n');
  const source = new LocalWaitSources({ defaultCwd: dir });
  const condition = { kind: 'file_changed', path: 'watched.txt' };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal(armed.baseline.fingerprint.exists, true);
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');

  await fs.writeFile(target, 'after-after\n');
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
});

test('file_changed records an absent baseline and matches creation', async (t) => {
  const dir = await tempDir(t);
  const target = path.join(dir, 'created.txt');
  const source = new LocalWaitSources({ defaultCwd: dir });
  const condition = { kind: 'file_changed', path: 'created.txt' };
  const armed = await source.arm(condition);
  assert.deepEqual(armed.baseline.fingerprint, { exists: false });
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');

  await fs.writeFile(target, 'created\n');
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
});

async function listenHttp(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('http_ready transitions from 503 pending to 204 matched and supports exact status', async (t) => {
  let status = 503;
  const url = await listenHttp(t, (_req, res) => {
    res.writeHead(status);
    res.end('ignored body');
  });
  const source = new LocalWaitSources({ defaultCwd: process.cwd() });
  const condition = { kind: 'http_ready', url };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');

  status = 204;
  const ready = await source.check(record(condition, armed.baseline));
  assert.equal(ready.status, 'matched');
  assert.match(ready.evidence, /status=204/);

  status = 503;
  const exact = { kind: 'http_ready', url, status: 503 };
  const exactArm = await source.arm(exact);
  assert.equal((await source.check(record(exact, exactArm.baseline))).status, 'matched');
});

test('http_ready rejects URL credentials and does not follow redirects', async (t) => {
  const source = new LocalWaitSources({ defaultCwd: process.cwd() });
  await assert.rejects(
    () => source.arm({ kind: 'http_ready', url: 'http://user:secret@127.0.0.1:12345/' }),
    (error) => error?.code === 'INVALID_WAIT_CONDITION',
  );

  let targetHits = 0;
  const target = await listenHttp(t, (_req, res) => {
    targetHits += 1;
    res.writeHead(204);
    res.end();
  });
  const redirect = await listenHttp(t, (_req, res) => {
    res.writeHead(302, { location: target });
    res.end();
  });
  const condition = { kind: 'http_ready', url: redirect, status: 204 };
  const armed = await source.arm(condition);
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'pending');
  assert.equal(targetHits, 0);
});

test('systemd_user invokes systemctl with an argument array and matches requested state', async () => {
  const calls = [];
  const execFileImpl = async (file, args) => {
    calls.push({ file, args });
    return { stdout: 'active\nrunning\n', stderr: '' };
  };
  const source = new LocalWaitSources({
    defaultCwd: process.cwd(),
    systemctlBin: '/usr/bin/systemctl',
    execFileImpl,
  });
  const condition = { kind: 'systemd_user', unit: 'demo@one.service' };
  const armed = await source.arm(condition);
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'matched');
  assert.deepEqual(calls, [{
    file: '/usr/bin/systemctl',
    args: ['--user', 'show', 'demo@one.service', '--property=ActiveState', '--property=SubState', '--value'],
  }]);
});

test('systemd_user reports command or bus failures as WAIT_SOURCE_UNAVAILABLE', async () => {
  const source = new LocalWaitSources({
    defaultCwd: process.cwd(),
    execFileImpl: async () => {
      throw Object.assign(new Error('Failed to connect to bus'), { code: 1 });
    },
  });
  const condition = { kind: 'systemd_user', unit: 'demo.service', state: 'active' };
  const armed = await source.arm(condition);
  const result = await source.check(record(condition, armed.baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'WAIT_SOURCE_UNAVAILABLE');
});
