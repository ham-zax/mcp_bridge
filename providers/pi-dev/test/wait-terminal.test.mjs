import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { BrokerClient } from '../../terminal/broker-client.mjs';
import { TerminalError } from '../../terminal/protocol.mjs';
import {
  makeSandbox,
  onceExit,
  startBroker,
  waitFor,
} from '../../terminal/test/helpers.mjs';
import { TerminalWaitSource } from '../wait-terminal.mjs';

async function open(client, name, command = 'cat') {
  return client.request('session.open', { name, command });
}

async function sendLine(client, name, text) {
  await client.request('session.send', { name, text });
  await client.request('session.send', { name, key: 'Enter' });
}

async function waitForSource(source, record, predicate = (result) => result.status !== 'pending') {
  let baseline = record.baseline;
  let result;
  await waitFor(async () => {
    result = await source.check({ ...record, baseline });
    if (result.baseline !== undefined) baseline = result.baseline;
    return predicate(result);
  }, { timeoutMs: 4000, intervalMs: 20, description: 'terminal wait source result' });
  return { ...result, baseline: result.baseline ?? baseline };
}

function outputRecord(condition, baseline) {
  return { condition, baseline };
}

test('terminal output wait arms at transcript end and does not consume model unread output', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'race');
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'race', literal: 'READY_NOW' };

  const armed = await source.arm(condition);
  const observed = await client.request('session.observe', { name: 'race' });
  assert.equal(armed.status, 'pending');
  assert.equal(armed.baseline.cursor, observed.transcript.endOffset);
  assert.equal(armed.baseline.generation, observed.generation);
  assert.equal(armed.baseline.overlapBase64, '');

  await sendLine(client, 'race', 'READY_NOW');
  const matched = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(matched.status, 'matched');
  assert.match(matched.evidence, /READY_NOW/);

  const modelRead = await client.request('model.read', { name: 'race' });
  assert.match(modelRead.text, /READY_NOW/);
  const empty = await client.request('model.read', { name: 'race' });
  assert.equal(empty.text, '');
});

test('literal matching survives transcript chunk boundaries with bounded overlap', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'chunks');
  const source = new TerminalWaitSource({ client, maxReadBytes: 3 });
  const condition = { kind: 'terminal_output', session: 'chunks', literal: 'READY_NOW' };
  const armed = await source.arm(condition);

  await sendLine(client, 'chunks', 'READY_NOW');
  const matched = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(matched.status, 'matched');
  assert.ok(Buffer.from(matched.baseline.overlapBase64, 'base64').length <= Buffer.byteLength('READY_NOW') - 1);
});

test('terminal output wait keeps CURSOR_EXPIRED explicit and never jumps to retained tail', async (t) => {
  const sandbox = await makeSandbox(t, { budgetBytes: 32 });
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'expired');
  const source = new TerminalWaitSource({ client, maxReadBytes: 8 });
  const condition = { kind: 'terminal_output', session: 'expired', literal: 'NEVER_MATCH' };
  const armed = await source.arm(condition);

  await sendLine(client, 'expired', '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await waitFor(async () => {
    const observed = await client.request('session.observe', { name: 'expired' });
    return observed.transcript.baseOffset > armed.baseline.cursor;
  }, { description: 'transcript rotation' });

  const result = await source.check(outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'CURSOR_EXPIRED');
  assert.ok(result.details.baseOffset > armed.baseline.cursor);
  assert.equal(result.baseline.cursor, armed.baseline.cursor);
});

test('terminal output wait keeps CURSOR_AHEAD explicit', async () => {
  const client = {
    async request(op) {
      if (op === 'session.observe') {
        return {
          name: 'ahead',
          generation: '11111111-1111-4111-8111-111111111111',
          paneDead: false,
          paneDeadStatus: null,
          panePid: 1,
          transcript: { baseOffset: 0, endOffset: 4 },
        };
      }
      throw new Error(`unexpected request ${op}`);
    },
  };
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'ahead', literal: 'x' };
  const baseline = {
    generation: '11111111-1111-4111-8111-111111111111',
    cursor: 5,
    overlapBase64: '',
  };
  const result = await source.check(outputRecord(condition, baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'CURSOR_AHEAD');
  assert.deepEqual(result.details, { baseOffset: 0, endOffset: 4 });
  assert.equal(result.baseline.cursor, 5);
});

test('retained dead terminal drains final output then fails WAIT_SOURCE_ENDED with exact exit status', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'dead-output', "sleep 0.15; printf 'FINAL_NO_MATCH\\n'; exit 7");
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'dead-output', literal: 'NEVER_MATCH' };
  const armed = await source.arm(condition);

  await waitFor(async () => (await client.request('session.observe', { name: 'dead-output' })).paneDead === true, {
    description: 'retained dead pane',
  });
  const result = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'WAIT_SOURCE_ENDED');
  assert.equal(result.details.exitStatus, 7);
});

test('terminal_exit matches retained exact nonzero status', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'exit-seven', "sleep 0.05; exit 7");
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_exit', session: 'exit-seven' };
  const armed = await source.arm(condition);
  const result = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'matched');
  assert.match(result.evidence, /exit=7/);
  assert.equal(result.details.exitStatus, 7);
});

test('same-name replacement fails an old wait as WAIT_SOURCE_REPLACED', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'replacement');
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'replacement', literal: 'NEW_MARKER' };
  const armed = await source.arm(condition);

  await client.request('session.close', { name: 'replacement', force: true });
  await open(client, 'replacement');
  await sendLine(client, 'replacement', 'NEW_MARKER');
  const result = await source.check(outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'WAIT_SOURCE_REPLACED');
});

test('generation mismatch during transcript read maps to WAIT_SOURCE_REPLACED without accepting replacement bytes', async () => {
  const generation = '22222222-2222-4222-8222-222222222222';
  const client = {
    async request(op) {
      if (op === 'session.observe') {
        return {
          name: 'read-race', generation, paneDead: false, paneDeadStatus: null, panePid: 1,
          transcript: { baseOffset: 0, endOffset: 20 },
        };
      }
      if (op === 'session.read') {
        throw new TerminalError('SESSION_GENERATION_MISMATCH', 'session generation changed', {
          expectedGeneration: generation,
          actualGeneration: '33333333-3333-4333-8333-333333333333',
        });
      }
      throw new Error(`unexpected request ${op}`);
    },
  };
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'read-race', literal: 'REPLACEMENT_MARKER' };
  const baseline = { generation, cursor: 0, overlapBase64: '' };
  const result = await source.check(outputRecord(condition, baseline));
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'WAIT_SOURCE_REPLACED');
  assert.equal(result.baseline.cursor, 0);
});

test('broker restart preserves generation and wait cursor semantics', async (t) => {
  const sandbox = await makeSandbox(t);
  const broker1 = await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'broker-restart');
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'broker-restart', literal: 'AFTER_RESTART' };
  const armed = await source.arm(condition);
  const before = await client.request('session.observe', { name: 'broker-restart' });

  broker1.kill('SIGTERM');
  await onceExit(broker1);
  await startBroker(t, sandbox);
  const after = await client.request('session.observe', { name: 'broker-restart' });
  assert.equal(after.generation, before.generation);
  assert.equal(armed.baseline.cursor, before.transcript.endOffset);

  await sendLine(client, 'broker-restart', 'AFTER_RESTART');
  const result = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'matched');
});

test('human takeover does not block read-only terminal output waits', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const client = new BrokerClient({ socketPath: sandbox.brokerSocket });
  await open(client, 'human-read', "sleep 0.2; printf 'HUMAN_READ_OK\\n'; exec cat");
  const source = new TerminalWaitSource({ client });
  const condition = { kind: 'terminal_output', session: 'human-read', literal: 'HUMAN_READ_OK' };
  const armed = await source.arm(condition);

  await client.request('lease.acquire_human', { name: 'human-read', clientId: 'wait-test-human' });
  await assert.rejects(
    () => client.request('session.send', { name: 'human-read', text: 'blocked' }),
    (error) => error?.code === 'HUMAN_HAS_CONTROL',
  );
  const result = await waitForSource(source, outputRecord(condition, armed.baseline));
  assert.equal(result.status, 'matched');
});

test('terminal output literal validation rejects empty and oversized values', async () => {
  const source = new TerminalWaitSource({ client: { request: async () => assert.fail('should not call broker') } });
  await assert.rejects(
    () => source.arm({ kind: 'terminal_output', session: 'x', literal: '' }),
    (error) => error?.code === 'INVALID_WAIT_CONDITION',
  );
  await assert.rejects(
    () => source.arm({ kind: 'terminal_output', session: 'x', literal: 'x'.repeat(1025) }),
    (error) => error?.code === 'INVALID_WAIT_CONDITION',
  );
});
