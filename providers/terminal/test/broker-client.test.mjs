import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BrokerClient } from '../broker-client.mjs';

async function tempSocket(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'terminal-broker-client-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'broker.sock');
}

function serveOne(socketPath, response) {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffered = '';
    socket.on('data', (chunk) => {
      buffered += chunk;
      if (!buffered.includes('\n')) return;
      socket.end(`${JSON.stringify(response)}\n`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

test('broker client reconnects while the broker socket is briefly unavailable', async (t) => {
  const socketPath = await tempSocket(t);
  const client = new BrokerClient({ socketPath, retryWindowMs: 1000, retryIntervalMs: 20 });

  const requestPromise = client.request('session.list', {});
  await new Promise((resolve) => setTimeout(resolve, 100));
  const server = await serveOne(socketPath, { id: 1, ok: true, result: { sessions: [{ name: 'kept' }] } });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const result = await requestPromise;
  assert.deepEqual(result, { sessions: [{ name: 'kept' }] });
});

test('broker client preserves Terminal error code and details', async (t) => {
  const socketPath = await tempSocket(t);
  const server = await serveOne(socketPath, {
    id: 1,
    ok: false,
    error: {
      code: 'CURSOR_AHEAD',
      message: 'cursor 4 is beyond transcript end 3',
      details: { baseOffset: 0, endOffset: 3 },
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new BrokerClient({ socketPath, retryWindowMs: 200, retryIntervalMs: 10 });

  await assert.rejects(
    () => client.request('model.read', { name: 'x' }),
    (error) => {
      assert.equal(error.code, 'CURSOR_AHEAD');
      assert.deepEqual(error.details, { baseOffset: 0, endOffset: 3 });
      assert.match(error.message, /beyond transcript end 3/);
      return true;
    },
  );
});
