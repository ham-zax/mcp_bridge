import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import test from 'node:test';

import { createFrontendController } from '../frontend.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const WSL_TERM = path.join(REPO_ROOT, 'bin', 'wsl-term');

function enoent() {
  const error = new Error('missing');
  error.code = 'ENOENT';
  return error;
}

function fakeChild(pid = 43210) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.unrefCalled = false;
  child.unref = () => { child.unrefCalled = true; };
  return child;
}

function stateClient(states) {
  let index = 0;
  const requests = [];
  return {
    requests,
    client: {
      async request(op, params) {
        requests.push({ op, params });
        assert.equal(op, 'session.list');
        const state = states[Math.min(index, states.length - 1)];
        index += 1;
        return { sessions: state ? [state] : [] };
      },
    },
  };
}

function fakeClock() {
  let ms = 0;
  return {
    now: () => ms,
    sleep: async (delayMs) => { ms += delayMs; },
  };
}

test('frontend controller exposes ensurePresented', () => {
  const controller = createFrontendController();
  assert.equal(typeof controller.ensurePresented, 'function');
});

test('ensurePresented reuses an existing designated frontend without spawning', async () => {
  const { client } = stateClient([
    { name: 'demo', humanLease: false, humanAttached: true },
  ]);
  let spawnCount = 0;
  const controller = createFrontendController({
    client,
    repoRoot: REPO_ROOT,
    spawnFn() { spawnCount += 1; throw new Error('must not spawn'); },
  });

  const result = await controller.ensurePresented('demo');
  assert.deepEqual(result, { name: 'demo', status: 'reused' });
  assert.equal(spawnCount, 0);
});

test('ensurePresented launches explicit Kitty with WSLg child env and safe argv', async () => {
  const { client } = stateClient([
    { name: 'demo', humanLease: false, humanAttached: false },
    { name: 'demo', humanLease: false, humanAttached: true },
  ]);
  const child = fakeChild();
  const spawns = [];
  const env = {
    HOME: '/home/tester',
    PATH: '/usr/bin:/bin',
    MCP_TERMINAL_SOCKET: '/run/user/1000/wsl-agent-terminal.sock',
    MCP_TERMINAL_KITTY_BIN: '/opt/kitty/bin/kitty',
  };
  const socketPaths = new Set([
    '/mnt/wslg/runtime-dir/wayland-0',
    '/mnt/wslg/PulseServer',
  ]);
  const controller = createFrontendController({
    client,
    env,
    repoRoot: REPO_ROOT,
    accessFn: async (candidate) => {
      if (candidate !== '/opt/kitty/bin/kitty') throw enoent();
    },
    statFn: async (candidate) => {
      if (socketPaths.has(candidate)) return { isSocket: () => true };
      if (candidate === '/tmp/.X11-unix/X0') return { isSocket: () => true };
      throw enoent();
    },
    spawnFn(command, args, options) {
      spawns.push({ command, args, options });
      return child;
    },
    ...fakeClock(),
  });

  const result = await controller.ensurePresented('demo');
  assert.deepEqual(result, { name: 'demo', status: 'launch-attempted' });
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].command, '/opt/kitty/bin/kitty');
  assert.deepEqual(spawns[0].args, [
    '--title', 'Terminal: demo', WSL_TERM, 'present', 'demo',
  ]);
  assert.equal(spawns[0].options.detached, true);
  assert.equal(spawns[0].options.stdio, 'ignore');
  assert.equal(spawns[0].options.env.MCP_TERMINAL_SOCKET, env.MCP_TERMINAL_SOCKET);
  assert.equal(spawns[0].options.env.XDG_RUNTIME_DIR, '/mnt/wslg/runtime-dir');
  assert.equal(spawns[0].options.env.WAYLAND_DISPLAY, 'wayland-0');
  assert.equal(spawns[0].options.env.DISPLAY, ':0');
  assert.equal(spawns[0].options.env.PULSE_SERVER, 'unix:/mnt/wslg/PulseServer');
  assert.equal(env.WAYLAND_DISPLAY, undefined);
  assert.equal(child.unrefCalled, true);
});

test('Kitty discovery falls back from explicit override to user install then PATH', async (t) => {
  for (const scenario of [
    {
      name: 'user install',
      env: { HOME: '/home/tester', PATH: '/usr/bin:/bin', MCP_TERMINAL_KITTY_BIN: '/missing/kitty' },
      executable: '/home/tester/.local/kitty.app/bin/kitty',
    },
    {
      name: 'PATH',
      env: { HOME: '/home/tester', PATH: '/first:/second' },
      executable: '/second/kitty',
    },
  ]) {
    await t.test(scenario.name, async () => {
      const { client } = stateClient([
        { name: 'demo', humanLease: false, humanAttached: false },
        { name: 'demo', humanLease: false, humanAttached: true },
      ]);
      const spawns = [];
      const controller = createFrontendController({
        client,
        env: scenario.env,
        repoRoot: REPO_ROOT,
        accessFn: async (candidate) => {
          if (candidate !== scenario.executable) throw enoent();
        },
        statFn: async () => { throw enoent(); },
        spawnFn(command, args, options) {
          spawns.push({ command, args, options });
          return fakeChild();
        },
        ...fakeClock(),
      });

      const result = await controller.ensurePresented('demo');
      assert.equal(result.status, 'launch-attempted');
      assert.equal(spawns[0].command, scenario.executable);
    });
  }
});

test('ensurePresented waits for attachment-in-progress before deciding to launch', async () => {
  const { client, requests } = stateClient([
    { name: 'demo', humanLease: true, humanAttached: false },
    { name: 'demo', humanLease: true, humanAttached: false },
    { name: 'demo', humanLease: false, humanAttached: false },
    { name: 'demo', humanLease: false, humanAttached: true },
  ]);
  let requestCountAtSpawn = 0;
  const controller = createFrontendController({
    client,
    env: { HOME: '/home/tester', PATH: '/bin' },
    repoRoot: REPO_ROOT,
    accessFn: async (candidate) => {
      if (candidate !== '/bin/kitty') throw enoent();
    },
    statFn: async () => { throw enoent(); },
    spawnFn() {
      requestCountAtSpawn = requests.length;
      return fakeChild();
    },
    readinessTimeoutMs: 100,
    pollIntervalMs: 10,
    ...fakeClock(),
  });

  const result = await controller.ensurePresented('demo');
  assert.equal(result.status, 'launch-attempted');
  assert.ok(requestCountAtSpawn >= 3, `spawned after only ${requestCountAtSpawn} state reads`);
});

test('concurrent ensurePresented calls for one session are single-flight', async () => {
  let attached = false;
  const requests = [];
  const client = {
    async request(op) {
      assert.equal(op, 'session.list');
      requests.push(op);
      return { sessions: [{ name: 'demo', humanLease: false, humanAttached: attached }] };
    },
  };
  let spawnCount = 0;
  const clock = fakeClock();
  const controller = createFrontendController({
    client,
    env: { HOME: '/home/tester', PATH: '/bin' },
    repoRoot: REPO_ROOT,
    accessFn: async (candidate) => {
      if (candidate !== '/bin/kitty') throw enoent();
    },
    statFn: async () => { throw enoent(); },
    spawnFn() {
      spawnCount += 1;
      return fakeChild();
    },
    now: clock.now,
    sleep: async (ms) => {
      await Promise.resolve();
      attached = true;
      await clock.sleep(ms);
    },
  });

  const [first, second] = await Promise.all([
    controller.ensurePresented('demo'),
    controller.ensurePresented('demo'),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'launch-attempted');
  assert.equal(spawnCount, 1);
});

test('frontend unavailable returns actionable manual attach fallback', async () => {
  const { client } = stateClient([
    { name: 'demo', humanLease: false, humanAttached: false },
  ]);
  const controller = createFrontendController({
    client,
    env: { HOME: '/home/tester', PATH: '/one:/two' },
    repoRoot: REPO_ROOT,
    accessFn: async () => { throw enoent(); },
  });

  await assert.rejects(
    controller.ensurePresented('demo'),
    (error) => error?.code === 'FRONTEND_UNAVAILABLE'
      && error.message.includes(`${WSL_TERM} attach demo`),
  );
});

test('synchronous Kitty spawn failure returns a stable frontend error with manual fallback', async () => {
  const { client } = stateClient([
    { name: 'demo', humanLease: false, humanAttached: false },
  ]);
  const controller = createFrontendController({
    client,
    env: { HOME: '/home/tester', PATH: '/bin' },
    repoRoot: REPO_ROOT,
    accessFn: async (candidate) => {
      if (candidate !== '/bin/kitty') throw enoent();
    },
    statFn: async () => { throw enoent(); },
    spawnFn() { throw new Error('spawn exploded'); },
    ...fakeClock(),
  });

  await assert.rejects(
    controller.ensurePresented('demo'),
    (error) => error?.code === 'FRONTEND_LAUNCH_FAILED'
      && /spawn exploded/.test(error.message)
      && error.message.includes(`${WSL_TERM} attach demo`),
  );
});

test('readiness timeout terminates only the Kitty process group spawned by this request', async () => {
  const { client } = stateClient([
    { name: 'demo', humanLease: false, humanAttached: false },
  ]);
  const child = fakeChild(56789);
  const killed = [];
  const clock = fakeClock();
  const controller = createFrontendController({
    client,
    env: { HOME: '/home/tester', PATH: '/bin' },
    repoRoot: REPO_ROOT,
    accessFn: async (candidate) => {
      if (candidate !== '/bin/kitty') throw enoent();
    },
    statFn: async () => { throw enoent(); },
    spawnFn: () => child,
    killProcessGroup: async (pid) => { killed.push(pid); },
    readinessTimeoutMs: 30,
    pollIntervalMs: 10,
    now: clock.now,
    sleep: clock.sleep,
  });

  await assert.rejects(
    controller.ensurePresented('demo'),
    (error) => error?.code === 'FRONTEND_NOT_READY'
      && error.message.includes(`${WSL_TERM} attach demo`),
  );
  assert.deepEqual(killed, [56789]);
  assert.equal(child.unrefCalled, false);
});
