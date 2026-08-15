import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WaitStore } from '../wait-state.mjs';

async function fixtureStore(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wait-store-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state');
  await mkdir(stateDir, { recursive: true });
  return new WaitStore({ stateDir });
}

function pendingRecord(name = 'build-ready') {
  return {
    name,
    definition: {
      condition: { kind: 'tcp_listen', host: '127.0.0.1', port: 43210 },
      timeoutSeconds: 300,
    },
    condition: { kind: 'tcp_listen', host: '127.0.0.1', port: 43210 },
    timeoutSeconds: 300,
    armedAtMs: 1000,
    deadlineAtMs: 301000,
    status: 'pending',
    baseline: null,
  };
}

test('wait store writes versioned private state atomically', async (t) => {
  const store = await fixtureStore(t);
  await store.create(pendingRecord());
  const saved = await store.read('build-ready');
  assert.equal(saved.version, 1);
  assert.equal(saved.status, 'pending');
  assert.equal((await stat(store.rootDir)).mode & 0o777, 0o700);
  assert.equal((await stat(store.fileFor('build-ready'))).mode & 0o777, 0o600);
});

test('wait store rejects invalid names and corrupt state', async (t) => {
  const store = await fixtureStore(t);
  assert.throws(() => store.fileFor('../escape'), (error) => error.code === 'INVALID_WAIT_NAME');
  await store.ensureRoot();
  await writeFile(path.join(store.rootDir, 'broken.json'), '{not json', { mode: 0o600 });
  await assert.rejects(() => store.read('broken'), (error) => error.code === 'WAIT_STATE_CORRUPT');
});

test('same-name filesystem lock serializes concurrent writers', async (t) => {
  const store = await fixtureStore(t);
  let releaseHolder;
  const holderGate = new Promise((resolve) => { releaseHolder = resolve; });
  const order = [];
  const holder = store.withLock('serial', async () => {
    order.push('holder-enter');
    await holderGate;
    order.push('holder-exit');
  }, { maxWaitMs: 1000 });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const waiter = store.withLock('serial', async () => {
    order.push('waiter-enter');
  }, { maxWaitMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(order, ['holder-enter']);
  releaseHolder();
  await Promise.all([holder, waiter]);
  assert.deepEqual(order, ['holder-enter', 'holder-exit', 'waiter-enter']);
});

test('canceled queued waiter never enters after the holder releases', async (t) => {
  const store = await fixtureStore(t);
  let releaseHolder;
  const holderGate = new Promise((resolve) => { releaseHolder = resolve; });
  const holder = store.withLock('cancel-queue', () => holderGate, { maxWaitMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 20));

  let canceledEntered = false;
  const controller = new AbortController();
  const canceled = store.withLock('cancel-queue', async () => {
    canceledEntered = true;
  }, { signal: controller.signal, maxWaitMs: 1000 });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(canceled, (error) => error.code === 'WAIT_ABORTED');
  releaseHolder();
  await holder;
  assert.equal(canceledEntered, false);

  let liveEntered = false;
  await store.withLock('cancel-queue', async () => { liveEntered = true; }, { maxWaitMs: 250 });
  assert.equal(liveEntered, true);
});

test('same-name contention fast-fails with WAIT_BUSY instead of joining a long hold', async (t) => {
  const store = await fixtureStore(t);
  let releaseHolder;
  const holderGate = new Promise((resolve) => { releaseHolder = resolve; });
  const holder = store.withLock('busy', () => holderGate, { maxWaitMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const started = Date.now();
  await assert.rejects(
    () => store.withLock('busy', async () => {}, { maxWaitMs: 80 }),
    (error) => error.code === 'WAIT_BUSY',
  );
  assert.ok(Date.now() - started < 250);
  releaseHolder();
  await holder;
});
