import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { TmuxBackend } from '../tmux.mjs';
import { makeSandbox, tmuxValue, waitFor } from './helpers.mjs';

test('dedicated tmux backend covers create, send, resize, capture, list, dead status, and close', async (t) => {
  const sandbox = await makeSandbox(t);
  const tmux = new TmuxBackend({
    socketPath: sandbox.socketPath,
    stateRoot: sandbox.stateRoot,
    defaultCwd: '/home/hamza',
    transcriptBudgetBytes: 1024 * 1024,
  });

  await tmux.openSession({ name: 'ops', command: 'cat', cols: 80, rows: 24 });
  assert.equal((await tmux.listSessions()).some((session) => session.name === 'ops'), true);
  assert.deepEqual(await tmux.listClients(), []);

  await tmux.send({ name: 'ops', text: 'screen-marker' });
  await tmux.send({ name: 'ops', key: 'Enter' });
  await waitFor(async () => (await tmux.captureScreen('ops')).includes('screen-marker'), {
    description: 'capture-pane marker',
  });

  await tmux.resize({ name: 'ops', cols: 113, rows: 41 });
  assert.equal(tmuxValue(sandbox.socketPath, 'ops:0.0', '#{pane_width}x#{pane_height}'), '113x41');
  const info = await tmux.sessionInfo('ops');
  assert.equal(info.paneDead, false);
  assert.equal(info.remainOnExit, true);

  await tmux.closeSession('ops');
  assert.equal((await tmux.listSessions()).some((session) => session.name === 'ops'), false);

  await tmux.openSession({ name: 'exit7', command: 'exit 7' });
  await waitFor(async () => {
    const exited = await tmux.sessionInfo('exit7');
    return exited.paneDead === true;
  }, { description: 'dead pane' });
  const exited = await tmux.sessionInfo('exit7');
  assert.equal(exited.remainOnExit, true);
  assert.equal(exited.paneDeadStatus, 7);
  await tmux.closeSession('exit7');
});

test('session metadata carries a stable generation across reconciliation and a new one after reopen', async (t) => {
  const sandbox = await makeSandbox(t);
  const tmux = new TmuxBackend({
    socketPath: sandbox.socketPath,
    stateRoot: sandbox.stateRoot,
    defaultCwd: '/home/hamza',
    transcriptBudgetBytes: 1024 * 1024,
  });

  await tmux.openSession({ name: 'generation-meta', command: 'cat' });
  const metadataFile = path.join(tmux.sessionDir('generation-meta'), 'session.json');
  const first = JSON.parse(await readFile(metadataFile, 'utf8'));
  assert.match(first.generation, /^[0-9a-f-]{36}$/i);

  await tmux.reconcileSession('generation-meta');
  const reconciled = JSON.parse(await readFile(metadataFile, 'utf8'));
  assert.equal(reconciled.generation, first.generation);

  await tmux.closeSession('generation-meta');
  await tmux.openSession({ name: 'generation-meta', command: 'cat' });
  const replacement = JSON.parse(await readFile(metadataFile, 'utf8'));
  assert.match(replacement.generation, /^[0-9a-f-]{36}$/i);
  assert.notEqual(replacement.generation, first.generation);
});

test('session names are constrained to the frozen contract', async (t) => {
  const sandbox = await makeSandbox(t);
  const tmux = new TmuxBackend({ socketPath: sandbox.socketPath, stateRoot: sandbox.stateRoot });
  await assert.rejects(() => tmux.openSession({ name: 'bad/name', command: 'true' }), /session name/i);
  await assert.rejects(() => tmux.openSession({ name: 'x'.repeat(65), command: 'true' }), /session name/i);
});
