import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  brokerRequest,
  makeSandbox,
  onceExit,
  startBroker,
  waitFor,
} from './helpers.mjs';

function request(id, op, params = {}) {
  return { id, op, params };
}

function tmuxClients(socketPath) {
  const result = spawnSync('tmux', [
    '-N', '-S', socketPath,
    'list-clients',
    '-F', '#{client_pid}|#{client_session}|#{client_tty}',
  ], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const [pid, session, tty] = line.split('|');
    return { pid: Number(pid), session, tty };
  });
}

function spawnTmuxAttach(t, sandbox, name) {
  const command = `exec tmux -N -S '${sandbox.socketPath}' attach-session -t '${name}'`;
  const child = spawn('script', ['-q', '-e', '-c', command, '/dev/null'], {
    detached: true,
    env: { ...process.env, TERM: process.env.TERM || 'xterm-256color' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      await onceExit(child).catch(() => {});
    }
  });
  return child;
}

test('broker enforces human ownership below model write paths while read and list stay available', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);

  const opened = await brokerRequest(sandbox.brokerSocket, request('open', 'session.open', {
    name: 'human-owned',
    command: "printf 'LEASE_READABLE\\n'; exec cat",
    cols: 80,
    rows: 24,
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));

  const acquired = await brokerRequest(sandbox.brokerSocket, request('acquire', 'lease.acquire_human', {
    name: 'human-owned',
    clientId: 'lease-test',
  }));
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  assert.equal(typeof acquired.result.leaseId, 'string');

  const listed = await brokerRequest(sandbox.brokerSocket, request('list', 'session.list'));
  assert.equal(listed.ok, true, JSON.stringify(listed));
  const listedSession = listed.result.sessions.find((session) => session.name === 'human-owned');
  assert.equal(listedSession?.humanLease, true);

  let read;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read', 'session.read', {
      name: 'human-owned', cursor: 0, maxBytes: 65536,
    }));
    if (!response.ok || !response.result.text.includes('LEASE_READABLE')) return false;
    read = response;
    return true;
  }, { description: 'read during human control' });
  assert.equal(read.ok, true);

  for (const [id, op, params] of [
    ['send', 'session.send', { name: 'human-owned', text: 'blocked' }],
    ['resize', 'session.resize', { name: 'human-owned', cols: 90, rows: 30 }],
    ['close', 'session.close', { name: 'human-owned' }],
    ['close-false', 'session.close', { name: 'human-owned', force: false }],
  ]) {
    const response = await brokerRequest(sandbox.brokerSocket, request(id, op, params));
    assert.equal(response.ok, false, `${op}: ${JSON.stringify(response)}`);
    assert.equal(response.error.code, 'HUMAN_HAS_CONTROL');
  }

  const forced = await brokerRequest(sandbox.brokerSocket, request('force-close', 'session.close', {
    name: 'human-owned', force: true,
  }));
  assert.equal(forced.ok, true, JSON.stringify(forced));
  assert.equal(forced.result.closed, true);
});

test('real tmux client ownership reconciles stale leases and survives broker restart', async (t) => {
  const sandbox = await makeSandbox(t);
  let broker = await startBroker(t, sandbox);

  const opened = await brokerRequest(sandbox.brokerSocket, request('real-open', 'session.open', {
    name: 'real-human', command: 'cat',
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));

  async function acquireAndAttach(id) {
    const acquired = await brokerRequest(sandbox.brokerSocket, request(`acquire-${id}`, 'lease.acquire_human', {
      name: 'real-human', clientId: `client-${id}`,
    }));
    assert.equal(acquired.ok, true, JSON.stringify(acquired));
    const attach = spawnTmuxAttach(t, sandbox, 'real-human');
    let actualClient;
    await waitFor(() => {
      actualClient = tmuxClients(sandbox.socketPath).find((client) => client.session === 'real-human');
      return Boolean(actualClient);
    }, { description: `real tmux client ${id}` });
    const bound = await brokerRequest(sandbox.brokerSocket, request(`bind-${id}`, 'lease.bind_human', {
      name: 'real-human', leaseId: acquired.result.leaseId, clientPid: actualClient.pid,
    }));
    assert.equal(bound.ok, true, JSON.stringify(bound));
    return { acquired, attach, actualClient };
  }

  const first = await acquireAndAttach('first');
  const blocked = await brokerRequest(sandbox.brokerSocket, request('real-blocked', 'session.send', {
    name: 'real-human', text: 'blocked while attached',
  }));
  assert.equal(blocked.ok, false, JSON.stringify(blocked));
  assert.equal(blocked.error.code, 'HUMAN_HAS_CONTROL');

  const detachedFirst = spawnSync('tmux', [
    '-N', '-S', sandbox.socketPath, 'detach-client', '-t', first.actualClient.tty,
  ], { encoding: 'utf8' });
  assert.equal(detachedFirst.status, 0, detachedFirst.stderr);
  await waitFor(() => tmuxClients(sandbox.socketPath).every((client) => client.session !== 'real-human'), {
    description: 'first tmux client detach',
  });
  const restored = await brokerRequest(sandbox.brokerSocket, request('real-restored', 'session.send', {
    name: 'real-human', text: 'restored',
  }));
  assert.equal(restored.ok, true, JSON.stringify(restored));

  const second = await acquireAndAttach('second');
  const brokerPidBefore = broker.pid;
  broker.kill('SIGTERM');
  await onceExit(broker);
  broker = await startBroker(t, sandbox);
  assert.notEqual(broker.pid, brokerPidBefore);

  const listed = await brokerRequest(sandbox.brokerSocket, request('real-list-after-restart', 'session.list'));
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assert.equal(listed.result.sessions.find((session) => session.name === 'real-human')?.humanLease, true);
  const blockedAfterRestart = await brokerRequest(sandbox.brokerSocket, request('real-blocked-after-restart', 'session.resize', {
    name: 'real-human', cols: 90, rows: 30,
  }));
  assert.equal(blockedAfterRestart.ok, false, JSON.stringify(blockedAfterRestart));
  assert.equal(blockedAfterRestart.error.code, 'HUMAN_HAS_CONTROL');

  const detachedSecond = spawnSync('tmux', [
    '-N', '-S', sandbox.socketPath, 'detach-client', '-t', second.actualClient.tty,
  ], { encoding: 'utf8' });
  assert.equal(detachedSecond.status, 0, detachedSecond.stderr);
  await waitFor(() => tmuxClients(sandbox.socketPath).every((client) => client.session !== 'real-human'), {
    description: 'second tmux client detach',
  });
  const restoredAfterRestart = await brokerRequest(sandbox.brokerSocket, request('real-restored-after-restart', 'session.resize', {
    name: 'real-human', cols: 91, rows: 31,
  }));
  assert.equal(restoredAfterRestart.ok, true, JSON.stringify(restoredAfterRestart));
});

test('bound lease that never becomes a real tmux client expires after attach grace', async (t) => {
  const sandbox = await makeSandbox(t);
  sandbox.env.MCP_TERMINAL_LEASE_ATTACH_GRACE_MS = '120';
  await startBroker(t, sandbox);

  const opened = await brokerRequest(sandbox.brokerSocket, request('grace-open', 'session.open', {
    name: 'grace-human', command: 'cat',
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const acquired = await brokerRequest(sandbox.brokerSocket, request('grace-acquire', 'lease.acquire_human', {
    name: 'grace-human', clientId: 'grace-client',
  }));
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  const bound = await brokerRequest(sandbox.brokerSocket, request('grace-bind', 'lease.bind_human', {
    name: 'grace-human', leaseId: acquired.result.leaseId, clientPid: 99999999,
  }));
  assert.equal(bound.ok, true, JSON.stringify(bound));

  const blocked = await brokerRequest(sandbox.brokerSocket, request('grace-blocked', 'session.send', {
    name: 'grace-human', text: 'still pending',
  }));
  assert.equal(blocked.ok, false, JSON.stringify(blocked));
  assert.equal(blocked.error.code, 'HUMAN_HAS_CONTROL');

  await new Promise((resolve) => setTimeout(resolve, 180));
  const restored = await brokerRequest(sandbox.brokerSocket, request('grace-restored', 'session.send', {
    name: 'grace-human', text: 'after grace',
  }));
  assert.equal(restored.ok, true, JSON.stringify(restored));
});
