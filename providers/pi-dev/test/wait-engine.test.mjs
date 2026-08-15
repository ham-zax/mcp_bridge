import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WaitEngine } from '../wait-engine.mjs';
import { LocalWaitSources } from '../wait-local.mjs';
import { WaitStore } from '../wait-state.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wait-engine-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state');
  await mkdir(stateDir, { recursive: true });
  const store = new WaitStore({ stateDir });
  let nowMs = 1000;
  let matched = false;
  let checks = 0;
  const source = {
    pollIntervalMs: 10,
    async arm() {
      return { status: 'pending', baseline: { cursor: 1 } };
    },
    async check(record) {
      checks += 1;
      if (matched) return { status: 'matched', baseline: record.baseline, evidence: 'ready' };
      return { status: 'pending', baseline: { cursor: (record.baseline?.cursor ?? 0) + 1 } };
    },
  };
  const engine = new WaitEngine({
    store,
    sources: { fake: source },
    now: () => nowMs,
    sleep: (ms, signal) => new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  return {
    store,
    engine,
    setNow(value) { nowMs = value; },
    setMatched(value) { matched = value; },
    checks: () => checks,
  };
}

test('named create, resume, timeout, cancellation, and lost-response retry are durable', async (t) => {
  const fx = await fixture(t);
  const condition = { kind: 'fake', value: 'x' };

  const created = await fx.engine.run({ name: 'durable', condition, timeout_seconds: 5, hold_seconds: 0 });
  assert.equal(created.status, 'pending');
  const firstSaved = await fx.store.read('durable');
  const firstDeadline = firstSaved.deadlineAtMs;
  assert.equal(firstDeadline, 6000);

  const identical = await fx.engine.run({ name: 'durable', condition, timeout_seconds: 5, hold_seconds: 0 });
  assert.equal(identical.status, 'pending');
  assert.equal((await fx.store.read('durable')).deadlineAtMs, firstDeadline);

  await assert.rejects(
    () => fx.engine.run({ name: 'durable', condition: { kind: 'fake', value: 'different' }, hold_seconds: 0 }),
    (error) => error.code === 'WAIT_CONFLICT',
  );

  fx.setMatched(true);
  const matched = await fx.engine.run({ name: 'durable', hold_seconds: 0 });
  assert.equal(matched.status, 'matched');
  assert.equal(matched.evidence, 'ready');
  const replay = await fx.engine.run({ name: 'durable', hold_seconds: 0 });
  assert.deepEqual(replay, matched);

  fx.setMatched(false);
  const timeoutCreate = await fx.engine.run({
    name: 'timeout', condition: { kind: 'fake', value: 'timeout' }, timeout_seconds: 1, hold_seconds: 0,
  });
  assert.equal(timeoutCreate.status, 'pending');
  const checksBeforeTimeout = fx.checks();
  fx.setNow(2500);
  const timedOut = await fx.engine.run({ name: 'timeout', hold_seconds: 0 });
  assert.equal(timedOut.status, 'timeout');
  assert.equal(fx.checks(), checksBeforeTimeout);

  const cancelCreate = await fx.engine.run({
    name: 'cancel', condition: { kind: 'fake', value: 'cancel' }, hold_seconds: 0,
  });
  assert.equal(cancelCreate.status, 'pending');
  const cancelled = await fx.engine.run({ name: 'cancel', cancel: true });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((await fx.store.read('cancel')).status, 'cancelled');
});

test('aborting an active hold leaves durable wait pending', async (t) => {
  const fx = await fixture(t);
  await fx.engine.run({ name: 'abort-hold', condition: { kind: 'fake' }, hold_seconds: 0 });

  const controller = new AbortController();
  const call = fx.engine.run({ name: 'abort-hold', hold_seconds: 1 }, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(call, (error) => error.code === 'WAIT_ABORTED');
  assert.equal((await fx.store.read('abort-hold')).status, 'pending');
});

test('request canceled while queued for wait lock never checks or mutates later', async (t) => {
  const fx = await fixture(t);
  await fx.engine.run({ name: 'abort-queued', condition: { kind: 'fake' }, hold_seconds: 0 });
  const beforeChecks = fx.checks();

  let releaseHolder;
  const gate = new Promise((resolve) => { releaseHolder = resolve; });
  const holder = fx.store.withLock('abort-queued', () => gate, { maxWaitMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const controller = new AbortController();
  const queued = fx.engine.run({ name: 'abort-queued', hold_seconds: 0 }, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(queued, (error) => error.code === 'WAIT_ABORTED');
  releaseHolder();
  await holder;
  assert.equal(fx.checks(), beforeChecks);
  assert.equal((await fx.store.read('abort-queued')).status, 'pending');

  const resumed = await fx.engine.run({ name: 'abort-queued', hold_seconds: 0 });
  assert.equal(resumed.status, 'pending');
  assert.ok(fx.checks() > beforeChecks);
});

test('transient systemd unavailability leaves the same durable wait pending for recovery resume', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wait-engine-systemd-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state');
  const store = new WaitStore({ stateDir });
  let unavailable = true;
  const local = new LocalWaitSources({
    defaultCwd: root,
    env: { PATH: process.env.PATH ?? '' },
    execFileImpl: async () => {
      if (unavailable) throw new Error('Failed to connect to bus');
      return { stdout: 'active\nrunning\n', stderr: '' };
    },
  });
  const engine = new WaitEngine({ store, sources: { systemd_user: local } });
  const condition = { kind: 'systemd_user', unit: 'demo.service', state: 'active' };

  await assert.rejects(
    () => engine.run({ name: 'systemd-recovery', condition, timeout_seconds: 30, hold_seconds: 0 }),
    (error) => error?.code === 'WAIT_SOURCE_UNAVAILABLE',
  );
  const pending = await store.read('systemd-recovery');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.condition.kind, 'systemd_user');
  const originalDeadline = pending.deadlineAtMs;
  const originalBaseline = structuredClone(pending.baseline);

  unavailable = false;
  const matched = await engine.run({ name: 'systemd-recovery', hold_seconds: 0 });
  assert.equal(matched.status, 'matched');
  const recovered = await store.read('systemd-recovery');
  assert.equal(recovered.deadlineAtMs, originalDeadline);
  assert.deepEqual(recovered.baseline, originalBaseline);
});
