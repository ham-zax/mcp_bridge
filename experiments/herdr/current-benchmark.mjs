#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BROKER = path.join(ROOT, 'providers/terminal/broker.mjs');
const TREE_METRICS = path.join(import.meta.dirname, 'measure-tree.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 20, description = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

function onceExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

function request(socketPath, op, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffered = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`request timeout: ${op}`));
    }, 5000);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: `${op}-${Date.now()}`, op, params })}\n`));
    socket.on('data', (chunk) => {
      buffered += chunk;
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timer);
      socket.end();
      const response = JSON.parse(buffered.slice(0, newline));
      if (!response.ok) {
        const error = new Error(`${response.error?.code || 'BROKER_ERROR'}: ${response.error?.message || 'request failed'}`);
        error.response = response;
        reject(error);
      } else {
        resolve(response.result);
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function startBroker(env, socketPath) {
  const child = spawn(process.execPath, [BROKER], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`broker exited ${child.exitCode}: ${stderr}`);
    try {
      await request(socketPath, 'session.list');
      return true;
    } catch {
      return false;
    }
  }, { description: 'broker socket' });
  return { child, stderr: () => stderr };
}

function tmux(socketPath, args) {
  const result = spawnSync('tmux', ['-N', '-S', socketPath, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`tmux ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}

function metrics(...roots) {
  const result = spawnSync(process.execPath, [TREE_METRICS, ...roots.map(String)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`metrics failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function readUntil(socketPath, name, predicate, { cursor = 0, timeoutMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let current = cursor;
  let text = '';
  let last;
  while (Date.now() < deadline) {
    last = await request(socketPath, 'session.read', { name, cursor: current, maxBytes: 65536 });
    text += last.text;
    current = last.nextCursor;
    if (predicate(text, last)) return { ...last, text };
    await sleep(20);
  }
  throw new Error(`timed out reading ${name}`);
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'herdr-current-bench-'));
const tmuxSocket = path.join(dir, 'tmux.sock');
const brokerSocket = path.join(dir, 'broker.sock');
const stateRoot = path.join(dir, 'state');
const tmuxServer = spawn('tmux', ['-D', '-S', tmuxSocket, '-f', '/dev/null'], { stdio: ['ignore', 'ignore', 'pipe'] });
let broker;
let broker2;

const result = {
  architecture: 'CURRENT_TMUX_BROKER',
  runtime: { tmux: spawnSync('tmux', ['-V'], { encoding: 'utf8' }).stdout.trim(), node: process.version },
};

try {
  await waitFor(() => spawnSync('tmux', ['-N', '-S', tmuxSocket, 'show-options', '-g', '-v', 'exit-empty']).status === 0, {
    description: 'tmux server',
  });
  const env = {
    ...process.env,
    MCP_TERMINAL_SOCKET: brokerSocket,
    MCP_TERMINAL_STATE_ROOT: stateRoot,
    MCP_TERMINAL_DEFAULT_CWD: '/home/hamza',
    MCP_TERMINAL_TMUX_SOCKET_PATH: tmuxSocket,
    MCP_TERMINAL_TRANSCRIPT_BUDGET_BYTES: String(16 * 1024 * 1024),
  };
  broker = await startBroker(env, brokerSocket);

  const tOpen = performance.now();
  const shell = await request(brokerSocket, 'session.open', { name: 'shell', cwd: '/home/hamza' });
  result.openInteractiveMs = performance.now() - tOpen;
  result.shell = { serverPid: shell.serverPid, panePid: shell.panePid };

  const beforeMetrics = metrics(shell.serverPid, broker.child.pid);
  await sleep(1000);
  const afterMetrics = metrics(shell.serverPid, broker.child.pid);
  result.idleResources = {
    processCount: afterMetrics.processCount,
    rssKb: afterMetrics.rssKb,
    pssKb: afterMetrics.pssKb,
    cpuSecondsPerSecond: afterMetrics.cpuSeconds - beforeMetrics.cpuSeconds,
    processes: afterMetrics.processes,
  };

  const sendStart = performance.now();
  await request(brokerSocket, 'session.send', { name: 'shell', text: "printf 'CURRENT_SEND_MARKER\\n'" });
  await request(brokerSocket, 'session.send', { name: 'shell', key: 'Enter' });
  const sent = await readUntil(brokerSocket, 'shell', (text) => text.includes('CURRENT_SEND_MARKER'));
  result.sendAndObserveMs = performance.now() - sendStart;
  result.sendMarkerSeen = sent.text.includes('CURRENT_SEND_MARKER');

  const resizeStartCursor = sent.nextCursor;
  const resized = await request(brokerSocket, 'session.resize', { name: 'shell', cols: 101, rows: 33 });
  await request(brokerSocket, 'session.send', { name: 'shell', text: "stty size; printf 'CURRENT_RESIZE_DONE\\n'" });
  await request(brokerSocket, 'session.send', { name: 'shell', key: 'Enter' });
  const resizeRead = await readUntil(brokerSocket, 'shell', (text) => text.includes('CURRENT_RESIZE_DONE'), { cursor: resizeStartCursor });
  const resizeScreen = tmux(tmuxSocket, ['capture-pane', '-p', '-S', '-20', '-t', 'shell:0.0']);
  result.resize = {
    reportedCols: resized.cols,
    reportedRows: resized.rows,
    sttySaw33x101: resizeScreen.includes('33 101'),
  };

  const navigationCursor = resizeRead.nextCursor;
  await request(brokerSocket, 'session.send', { name: 'shell', text: "printf 'CURRENT_NAV_MARKER\\n'" });
  await request(brokerSocket, 'session.send', { name: 'shell', key: 'Enter' });
  const navigationFirst = await readUntil(brokerSocket, 'shell', (text) => text.includes('CURRENT_NAV_MARKER'), { cursor: navigationCursor });
  await request(brokerSocket, 'session.send', { name: 'shell', key: 'Up' });
  await request(brokerSocket, 'session.send', { name: 'shell', key: 'Enter' });
  const navigationSecond = await readUntil(brokerSocket, 'shell', (text) => (text.match(/CURRENT_NAV_MARKER/g) || []).length >= 2, { cursor: navigationFirst.nextCursor });
  result.navigation = {
    upRepeatedPreviousCommand: (navigationSecond.text.match(/CURRENT_NAV_MARKER/g) || []).length >= 2,
  };

  await request(brokerSocket, 'session.open', { name: 'ctrld' });
  await waitFor(() => tmux(tmuxSocket, ['capture-pane', '-p', '-t', 'ctrld:0.0']).includes('$'), {
    description: 'Ctrl-D shell prompt readiness',
  });
  await request(brokerSocket, 'session.send', { name: 'ctrld', key: 'C-d' });
  await waitFor(async () => {
    const list = await request(brokerSocket, 'session.list');
    return list.sessions.find((entry) => entry.name === 'ctrld')?.paneDead === true;
  }, { description: 'Ctrl-D shell exit' });
  const ctrld = (await request(brokerSocket, 'session.list')).sessions.find((entry) => entry.name === 'ctrld');
  result.ctrlD = { paneDead: ctrld.paneDead, exitStatus: ctrld.paneDeadStatus };

  await request(brokerSocket, 'session.open', { name: 'human' });
  const attachScript = [
    `{ sleep 0.2; printf %s\\r \"printf 'CURRENT_HUMAN_ATTACH_MARKER\\\\n'\"; sleep 0.8; printf '\\002d'; }`,
    `| TERM=xterm-256color timeout 4s script -qefc \"tmux -S '${tmuxSocket}' attach-session -t human\" /dev/null`,
  ].join(' ');
  const attach = spawn('bash', ['-lc', attachScript], { stdio: ['ignore', 'ignore', 'pipe'] });
  let attachStderr = '';
  attach.stderr.on('data', (chunk) => { attachStderr += chunk.toString('utf8'); });
  await waitFor(() => tmux(tmuxSocket, ['display-message', '-p', '-t', 'human', '#{session_attached}']).trim() === '1', {
    description: 'human tmux attachment',
  });
  const humanRead = await readUntil(brokerSocket, 'human', (text) => text.includes('CURRENT_HUMAN_ATTACH_MARKER'));
  const attachedDuringRead = tmux(tmuxSocket, ['display-message', '-p', '-t', 'human', '#{session_attached}']).trim() === '1';
  const attachExitCode = await onceExit(attach);
  result.humanAttachUnderlying = {
    attachExitCode,
    attachStderr,
    exactSessionMarkerSeen: humanRead.text.includes('CURRENT_HUMAN_ATTACH_MARKER'),
    modelReadWorkedWhileAttached: attachedDuringRead,
    sessionStillAlive: !(await request(brokerSocket, 'session.list')).sessions.find((entry) => entry.name === 'human')?.paneDead,
  };

  const immediate = await request(brokerSocket, 'session.open', {
    name: 'immediate',
    command: "printf 'CURRENT_IMMEDIATE_FIRST_BYTES\\n'",
  });
  const immediateRead = await readUntil(brokerSocket, 'immediate', (text, read) => text.includes('CURRENT_IMMEDIATE_FIRST_BYTES') || read.endOffset > 0);
  result.immediateOutput = {
    panePid: immediate.panePid,
    text: immediateRead.text,
    firstBytesPresent: immediateRead.text.startsWith('CURRENT_IMMEDIATE_FIRST_BYTES'),
  };

  await request(brokerSocket, 'session.open', { name: 'exit7', command: 'exit 7' });
  await waitFor(async () => {
    const list = await request(brokerSocket, 'session.list');
    return list.sessions.find((entry) => entry.name === 'exit7')?.paneDead === true;
  }, { description: 'exit7 dead pane' });
  const exit7 = (await request(brokerSocket, 'session.list')).sessions.find((entry) => entry.name === 'exit7');
  result.nonzeroExit = { paneDead: exit7.paneDead, exitStatus: exit7.paneDeadStatus };

  await request(brokerSocket, 'session.open', {
    name: 'noisy',
    command: "for i in $(seq 1 5000); do printf 'CURRENT_NOISY_%04d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n' \"$i\"; done; printf 'CURRENT_NOISY_DONE\\n'",
  });
  const noisy = await readUntil(brokerSocket, 'noisy', (text) => text.includes('CURRENT_NOISY_DONE'), { timeoutMs: 10000 });
  result.noisyOutput = {
    bytesRead: Buffer.byteLength(noisy.text),
    firstLinePresent: noisy.text.includes('CURRENT_NOISY_0001_'),
    lastLinePresent: noisy.text.includes('CURRENT_NOISY_5000_'),
    donePresent: noisy.text.includes('CURRENT_NOISY_DONE'),
    baseOffset: noisy.baseOffset,
    endOffset: noisy.endOffset,
  };

  const tuiCommand = "python3 -c \"import sys,time; sys.stdout.write('\\x1b[?1049h\\x1b[2J\\x1b[HCURRENT_ALT_TOP\\x1b[10;20HCURRENT_ALT_MIDDLE'); sys.stdout.flush(); time.sleep(5)\"";
  await request(brokerSocket, 'session.open', { name: 'tui', command: tuiCommand });
  await sleep(200);
  const screen = tmux(tmuxSocket, ['capture-pane', '-p', '-t', 'tui:0.0']);
  result.tui = {
    topPresent: screen.includes('CURRENT_ALT_TOP'),
    middlePresent: screen.includes('CURRENT_ALT_MIDDLE'),
    capturedBytes: Buffer.byteLength(screen),
  };

  await request(brokerSocket, 'session.open', {
    name: 'durability',
    command: "i=0; while :; do printf 'CURRENT_TICK:%s\\n' \"$i\"; i=$((i+1)); sleep 0.1; done",
  });
  const before = (await request(brokerSocket, 'session.list')).sessions.find((entry) => entry.name === 'durability');
  const readBefore = await readUntil(brokerSocket, 'durability', (text) => text.includes('CURRENT_TICK:2'));
  const oldBrokerPid = broker.child.pid;
  broker.child.kill('SIGTERM');
  await onceExit(broker.child);

  // Deliberately try recovery while dead remain-on-exit panes are still present.
  // Task 6 currently aborts here because reconcileSession() re-runs pipe-pane on dead panes.
  let mixedRecoveryError = null;
  try {
    broker2 = await startBroker(env, brokerSocket);
  } catch (error) {
    mixedRecoveryError = error.message;
  }
  result.mixedDeadSessionRecovery = {
    succeeded: mixedRecoveryError === null,
    error: mixedRecoveryError,
  };
  if (broker2?.child?.exitCode === null) {
    broker2.child.kill('SIGTERM');
    await onceExit(broker2.child);
  }
  broker2 = undefined;

  // Remove only the benchmark's completed/TUI sessions so the required live-session
  // durability boundary can be measured independently from the dead-pane defect.
  for (const name of ['ctrld', 'human', 'immediate', 'exit7', 'noisy', 'tui']) {
    const probe = spawnSync('tmux', ['-N', '-S', tmuxSocket, 'has-session', '-t', name]);
    if (probe.status === 0) spawnSync('tmux', ['-N', '-S', tmuxSocket, 'kill-session', '-t', name]);
  }

  broker2 = await startBroker(env, brokerSocket);
  const after = (await request(brokerSocket, 'session.list')).sessions.find((entry) => entry.name === 'durability');
  const readAfter = await readUntil(brokerSocket, 'durability', (text) => text.includes('CURRENT_TICK:'), { cursor: readBefore.nextCursor });
  result.brokerRestart = {
    brokerPidBefore: oldBrokerPid,
    brokerPidAfter: broker2.child.pid,
    tmuxPidBefore: before.serverPid,
    tmuxPidAfter: after.serverPid,
    panePidBefore: before.panePid,
    panePidAfter: after.panePid,
    brokerChanged: oldBrokerPid !== broker2.child.pid,
    tmuxSame: before.serverPid === after.serverPid,
    paneSame: before.panePid === after.panePid,
    transcriptContinued: readAfter.text.includes('CURRENT_TICK:'),
    reconciled: after.name === 'durability',
  };

  const lease = await request(brokerSocket, 'lease.acquire_human', { name: 'shell', clientId: 'benchmark-human' });
  let sendWhileLeased = false;
  try {
    await request(brokerSocket, 'session.send', { name: 'shell', text: 'MODEL_WRITE_DURING_LEASE' });
    sendWhileLeased = true;
  } catch {}
  await request(brokerSocket, 'lease.release_human', { name: 'shell', leaseId: lease.leaseId });
  result.task6LeaseFoundation = {
    leaseAcquired: Boolean(lease.leaseId),
    sendStillAllowedDuringLease: sendWhileLeased,
    note: 'Task 7 is responsible for enforcing HUMAN_HAS_CONTROL on model writes.',
  };

  result.customCodeLines = Number(spawnSync('bash', ['-lc', `wc -l providers/terminal/{broker,tmux,transcript,transcript-writer,pane-entry,protocol}.mjs | tail -1 | awk '{print $1}'`], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.trim());

  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const candidate of [broker2?.child, broker?.child]) {
    if (candidate && candidate.exitCode === null) {
      candidate.kill('SIGTERM');
      await Promise.race([onceExit(candidate), sleep(500)]).catch(() => {});
    }
  }
  try { spawnSync('tmux', ['-N', '-S', tmuxSocket, 'kill-server']); } catch {}
  if (tmuxServer.exitCode === null) tmuxServer.kill('SIGTERM');
  await rm(dir, { recursive: true, force: true });
}
