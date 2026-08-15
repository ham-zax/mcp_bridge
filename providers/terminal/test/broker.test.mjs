import assert from 'node:assert/strict';
import test from 'node:test';

import {
  brokerRequest,
  makeSandbox,
  onceExit,
  processExists,
  startBroker,
  tmuxValue,
  waitFor,
} from './helpers.mjs';

function request(id, op, params = {}) {
  return { id, op, params };
}

test('broker restart preserves tmux server, PTY process, transcript capture, and recovered session', async (t) => {
  const sandbox = await makeSandbox(t);
  const broker1 = await startBroker(t, sandbox);

  const opened = await brokerRequest(sandbox.brokerSocket, request('open', 'session.open', {
    name: 'durable',
    cwd: '/home/hamza',
    command: "i=0; while :; do printf 'tick:%s\\n' \"$i\"; i=$((i+1)); sleep 0.05; done",
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));

  const tmuxPidBefore = Number(tmuxValue(sandbox.socketPath, 'durable:0.0', '#{pid}'));
  const panePidBefore = Number(tmuxValue(sandbox.socketPath, 'durable:0.0', '#{pane_pid}'));
  assert.ok(processExists(tmuxPidBefore));
  assert.ok(processExists(panePidBefore));

  let firstRead;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-before', 'session.read', {
      name: 'durable', cursor: 0, maxBytes: 65536,
    }));
    if (!response.ok || !response.result.text.includes('tick:')) return false;
    firstRead = response.result;
    return true;
  }, { description: 'initial transcript output' });

  const brokerPidBefore = broker1.pid;
  broker1.kill('SIGTERM');
  await onceExit(broker1);
  assert.equal(processExists(brokerPidBefore), false);
  assert.ok(processExists(tmuxPidBefore));
  assert.ok(processExists(panePidBefore));

  await new Promise((resolve) => setTimeout(resolve, 150));
  const broker2 = await startBroker(t, sandbox);
  const brokerPidAfter = broker2.pid;
  assert.notEqual(brokerPidAfter, brokerPidBefore);

  const tmuxPidAfter = Number(tmuxValue(sandbox.socketPath, 'durable:0.0', '#{pid}'));
  const panePidAfter = Number(tmuxValue(sandbox.socketPath, 'durable:0.0', '#{pane_pid}'));
  assert.equal(tmuxPidAfter, tmuxPidBefore);
  assert.equal(panePidAfter, panePidBefore);

  const listed = await brokerRequest(sandbox.brokerSocket, request('list-after', 'session.list'));
  assert.equal(listed.ok, true, JSON.stringify(listed));
  assert.equal(listed.result.sessions.some((session) => session.name === 'durable'), true);

  let continued;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-after', 'session.read', {
      name: 'durable', cursor: firstRead.nextCursor, maxBytes: 65536,
    }));
    if (!response.ok || response.result.text.length === 0) return false;
    continued = response.result;
    return true;
  }, { description: 'continued transcript after broker restart' });
  assert.match(continued.text, /tick:/);
  assert.ok(continued.nextCursor > firstRead.nextCursor);

  const killed = await brokerRequest(sandbox.brokerSocket, request('close', 'session.close', { name: 'durable' }));
  assert.equal(killed.ok, true, JSON.stringify(killed));
});

test('broker restart reconciles mixed live and dead retained panes idempotently', async (t) => {
  const sandbox = await makeSandbox(t);
  const broker1 = await startBroker(t, sandbox);

  for (const [name, command] of [
    ['mixed-live', "i=0; while :; do printf 'live:%s\\n' \"$i\"; i=$((i+1)); sleep 0.05; done"],
    ['mixed-zero', "printf 'zero-final\\n'; exit 0"],
    ['mixed-seven', "printf 'seven-final\\n'; exit 7"],
  ]) {
    const opened = await brokerRequest(sandbox.brokerSocket, request(`open-${name}`, 'session.open', {
      name,
      cwd: '/home/hamza',
      command,
    }));
    assert.equal(opened.ok, true, JSON.stringify(opened));
  }

  let listedBefore;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('list-before-mixed', 'session.list'));
    if (!response.ok) return false;
    const byName = new Map(response.result.sessions.map((session) => [session.name, session]));
    if (byName.get('mixed-live')?.paneDead !== false) return false;
    if (byName.get('mixed-zero')?.paneDead !== true || byName.get('mixed-zero')?.paneDeadStatus !== 0) return false;
    if (byName.get('mixed-seven')?.paneDead !== true || byName.get('mixed-seven')?.paneDeadStatus !== 7) return false;
    listedBefore = response;
    return true;
  }, { description: 'mixed live/dead pane states' });
  assert.equal(listedBefore.ok, true);

  const tmuxPidBefore = Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pid}'));
  const livePanePidBefore = Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pane_pid}'));
  assert.ok(processExists(tmuxPidBefore));
  assert.ok(processExists(livePanePidBefore));

  async function readUntil(name, marker) {
    let captured;
    await waitFor(async () => {
      const response = await brokerRequest(sandbox.brokerSocket, request(`read-${name}`, 'session.read', {
        name, cursor: 0, maxBytes: 65536,
      }));
      if (!response.ok || !response.result.text.includes(marker)) return false;
      captured = response.result;
      return true;
    }, { description: `${name} final transcript` });
    return captured;
  }

  const liveBefore = await readUntil('mixed-live', 'live:');
  const zeroFinal = await readUntil('mixed-zero', 'zero-final');
  const sevenFinal = await readUntil('mixed-seven', 'seven-final');

  broker1.kill('SIGTERM');
  await onceExit(broker1);
  assert.ok(processExists(tmuxPidBefore));
  assert.ok(processExists(livePanePidBefore));

  const broker2 = await startBroker(t, sandbox);
  const tmuxPidAfterFirst = Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pid}'));
  const livePanePidAfterFirst = Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pane_pid}'));
  assert.equal(tmuxPidAfterFirst, tmuxPidBefore);
  assert.equal(livePanePidAfterFirst, livePanePidBefore);

  const listedAfterFirst = await brokerRequest(sandbox.brokerSocket, request('list-after-first', 'session.list'));
  assert.equal(listedAfterFirst.ok, true, JSON.stringify(listedAfterFirst));
  const firstByName = new Map(listedAfterFirst.result.sessions.map((session) => [session.name, session]));
  assert.equal(firstByName.get('mixed-live')?.paneDead, false);
  assert.equal(firstByName.get('mixed-zero')?.paneDead, true);
  assert.equal(firstByName.get('mixed-zero')?.paneDeadStatus, 0);
  assert.equal(firstByName.get('mixed-seven')?.paneDead, true);
  assert.equal(firstByName.get('mixed-seven')?.paneDeadStatus, 7);

  for (const [name, marker, finalRead] of [
    ['mixed-zero', 'zero-final', zeroFinal],
    ['mixed-seven', 'seven-final', sevenFinal],
  ]) {
    const preserved = await brokerRequest(sandbox.brokerSocket, request(`read-${name}-preserved-after-first`, 'session.read', {
      name, cursor: 0, maxBytes: 65536,
    }));
    assert.equal(preserved.ok, true, JSON.stringify(preserved));
    assert.match(preserved.result.text, new RegExp(marker));
    assert.equal(preserved.result.nextCursor, finalRead.nextCursor);

    const response = await brokerRequest(sandbox.brokerSocket, request(`read-${name}-after-first`, 'session.read', {
      name, cursor: finalRead.nextCursor, maxBytes: 65536,
    }));
    assert.equal(response.ok, true, JSON.stringify(response));
    assert.equal(response.result.text, '');
    assert.equal(response.result.nextCursor, finalRead.nextCursor);
  }

  let liveAfterFirst;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-live-after-first', 'session.read', {
      name: 'mixed-live', cursor: liveBefore.nextCursor, maxBytes: 65536,
    }));
    if (!response.ok || response.result.text.length === 0) return false;
    liveAfterFirst = response.result;
    return true;
  }, { description: 'live transcript after first restart' });
  assert.match(liveAfterFirst.text, /live:/);
  assert.ok(liveAfterFirst.nextCursor > liveBefore.nextCursor);

  broker2.kill('SIGTERM');
  await onceExit(broker2);
  const broker3 = await startBroker(t, sandbox);
  assert.notEqual(broker3.pid, broker2.pid);
  assert.equal(Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pid}')), tmuxPidBefore);
  assert.equal(Number(tmuxValue(sandbox.socketPath, 'mixed-live:0.0', '#{pane_pid}')), livePanePidBefore);

  const listedAfterSecond = await brokerRequest(sandbox.brokerSocket, request('list-after-second', 'session.list'));
  assert.equal(listedAfterSecond.ok, true, JSON.stringify(listedAfterSecond));
  const secondByName = new Map(listedAfterSecond.result.sessions.map((session) => [session.name, session]));
  assert.equal(secondByName.get('mixed-live')?.paneDead, false);
  assert.equal(secondByName.get('mixed-zero')?.paneDeadStatus, 0);
  assert.equal(secondByName.get('mixed-seven')?.paneDeadStatus, 7);

  for (const [name, marker, finalRead] of [
    ['mixed-zero', 'zero-final', zeroFinal],
    ['mixed-seven', 'seven-final', sevenFinal],
  ]) {
    const preserved = await brokerRequest(sandbox.brokerSocket, request(`read-${name}-preserved-after-second`, 'session.read', {
      name, cursor: 0, maxBytes: 65536,
    }));
    assert.equal(preserved.ok, true, JSON.stringify(preserved));
    assert.match(preserved.result.text, new RegExp(marker));
    assert.equal(preserved.result.nextCursor, finalRead.nextCursor);

    const response = await brokerRequest(sandbox.brokerSocket, request(`read-${name}-after-second`, 'session.read', {
      name, cursor: finalRead.nextCursor, maxBytes: 65536,
    }));
    assert.equal(response.ok, true, JSON.stringify(response));
    assert.equal(response.result.text, '');
    assert.equal(response.result.nextCursor, finalRead.nextCursor);
  }

  let liveAfterSecond;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-live-after-second', 'session.read', {
      name: 'mixed-live', cursor: liveAfterFirst.nextCursor, maxBytes: 65536,
    }));
    if (!response.ok || response.result.text.length === 0) return false;
    liveAfterSecond = response.result;
    return true;
  }, { description: 'live transcript after second restart' });
  assert.match(liveAfterSecond.text, /live:/);
  assert.ok(liveAfterSecond.nextCursor > liveAfterFirst.nextCursor);

  for (const name of ['mixed-live', 'mixed-zero', 'mixed-seven']) {
    const closed = await brokerRequest(sandbox.brokerSocket, request(`close-${name}`, 'session.close', { name }));
    assert.equal(closed.ok, true, JSON.stringify(closed));
  }
});

test('immediate process output is captured from its first bytes', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);

  const marker = 'FIRST_BYTES_IMMEDIATE';
  const opened = await brokerRequest(sandbox.brokerSocket, request('open-burst', 'session.open', {
    name: 'burst',
    command: `printf '${marker}\\n'`,
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));

  let read;
  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-burst', 'session.read', {
      name: 'burst', cursor: 0, maxBytes: 65536,
    }));
    if (!response.ok || !response.result.text.includes(marker)) return false;
    read = response.result;
    return true;
  }, { description: 'immediate output marker' });
  assert.ok(read.text.indexOf(marker) >= 0);

  await waitFor(async () => {
    const listed = await brokerRequest(sandbox.brokerSocket, request('list-burst', 'session.list'));
    const session = listed.result.sessions.find((item) => item.name === 'burst');
    return session?.paneDead === true && session?.paneDeadStatus === 0;
  }, { description: 'dead pane status for immediate command' });
});

test('broker protocol supports send, resize, close, and human lease round-trip', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);

  const opened = await brokerRequest(sandbox.brokerSocket, request('open-cat', 'session.open', {
    name: 'interactive', command: 'cat', cols: 80, rows: 24,
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));

  assert.equal((await brokerRequest(sandbox.brokerSocket, request('send-text', 'session.send', {
    name: 'interactive', text: 'hello terminal',
  }))).ok, true);
  assert.equal((await brokerRequest(sandbox.brokerSocket, request('send-enter', 'session.send', {
    name: 'interactive', key: 'Enter',
  }))).ok, true);

  await waitFor(async () => {
    const response = await brokerRequest(sandbox.brokerSocket, request('read-cat', 'session.read', {
      name: 'interactive', cursor: 0, maxBytes: 65536,
    }));
    return response.ok && response.result.text.includes('hello terminal');
  }, { description: 'cat echo' });

  const resized = await brokerRequest(sandbox.brokerSocket, request('resize', 'session.resize', {
    name: 'interactive', cols: 101, rows: 37,
  }));
  assert.equal(resized.ok, true, JSON.stringify(resized));
  assert.equal(tmuxValue(sandbox.socketPath, 'interactive:0.0', '#{pane_width}x#{pane_height}'), '101x37');

  const acquired = await brokerRequest(sandbox.brokerSocket, request('lease-acquire', 'lease.acquire_human', {
    name: 'interactive', clientId: 'test-client',
  }));
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  assert.equal(typeof acquired.result.leaseId, 'string');

  const released = await brokerRequest(sandbox.brokerSocket, request('lease-release', 'lease.release_human', {
    name: 'interactive', leaseId: acquired.result.leaseId,
  }));
  assert.equal(released.ok, true, JSON.stringify(released));

  const closed = await brokerRequest(sandbox.brokerSocket, request('close-cat', 'session.close', { name: 'interactive' }));
  assert.equal(closed.ok, true, JSON.stringify(closed));
});

test('stopping the tmux lifetime boundary ends its PTY process', async (t) => {
  const sandbox = await makeSandbox(t);
  await startBroker(t, sandbox);
  const opened = await brokerRequest(sandbox.brokerSocket, request('open-boundary', 'session.open', {
    name: 'boundary', command: 'while :; do sleep 60; done',
  }));
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const panePid = Number(tmuxValue(sandbox.socketPath, 'boundary:0.0', '#{pane_pid}'));
  assert.ok(processExists(panePid));

  const { spawnSync } = await import('node:child_process');
  const stopped = spawnSync('tmux', ['-N', '-S', sandbox.socketPath, 'kill-server'], { encoding: 'utf8' });
  assert.equal(stopped.status, 0, stopped.stderr);
  await waitFor(() => !processExists(panePid), { description: 'PTY process exit after tmux stop' });
});
