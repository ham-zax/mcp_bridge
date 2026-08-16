#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const HERE = import.meta.dirname;
const TREE_METRICS = path.join(HERE, 'measure-tree.mjs');
const HERDR = process.env.HERDR_BIN || '/tmp/herdr-v0.8.0';
const EXPECTED_SHA256 = 'b872ea7e40fa2cb17e857ac9b62b1bf26db7b403c622f5d2f3f5b35f6e9acd28';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 20, description = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
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

function run(env, args, { allowFailure = false, timeout = 10000 } = {}) {
  const result = spawnSync(HERDR, args, { env, encoding: 'utf8', timeout });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`herdr ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function json(env, args, options) {
  const result = run(env, args, options);
  return JSON.parse(result.stdout.trim());
}

function metrics(...roots) {
  const result = spawnSync(process.execPath, [TREE_METRICS, ...roots.map(String)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`metrics failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function startServer(env, root, suffix = '') {
  const child = spawn(HERDR, ['server'], {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}: ${stderr}`);
    const status = run(env, ['status', 'server', '--json'], { allowFailure: true, timeout: 2000 });
    if (status.status !== 0 || !status.stdout.trim()) return false;
    try { return JSON.parse(status.stdout).running === true; } catch { return false; }
  }, { timeoutMs: 5000, description: `Herdr server${suffix}` });
  await writeFile(path.join(root, `server${suffix}.pid`), `${child.pid}\n`);
  return child;
}

function paneList(env) {
  return json(env, ['pane', 'list']).result.panes;
}

function processInfo(env, pane) {
  return json(env, ['pane', 'process-info', '--pane', pane]).result.process_info;
}

function readPane(env, pane, source = 'recent-unwrapped', lines = 80) {
  return run(env, ['pane', 'read', pane, '--source', source, '--lines', String(lines)], { allowFailure: true }).stdout;
}

async function waitPaneGone(env, pane, timeoutMs = 3000) {
  return waitFor(() => !paneList(env).some((entry) => entry.pane_id === pane), {
    timeoutMs,
    description: `${pane} to close`,
  });
}

const version = run(process.env, ['--version']).stdout.trim();
if (version !== 'herdr 0.8.0') throw new Error(`expected Herdr v0.8.0, got: ${version}`);
const sha = spawnSync('sha256sum', [HERDR], { encoding: 'utf8' }).stdout.split(/\s+/)[0];
if (sha !== EXPECTED_SHA256) throw new Error(`Herdr binary SHA mismatch: ${sha}`);

const root = await mkdtemp(path.join(os.tmpdir(), 'herdr-v080-benchmark-'));
await mkdir(path.join(root, 'config'), { recursive: true });
await mkdir(path.join(root, 'state'), { recursive: true });
await writeFile(path.join(root, 'config.toml'), [
  'onboarding = false',
  '[update]',
  'version_check = false',
  'manifest_check = false',
  '',
].join('\n'));
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_STATE_HOME: path.join(root, 'state'),
  HERDR_CONFIG_PATH: path.join(root, 'config.toml'),
  HERDR_SESSION: 'agent3-v080-benchmark',
  SHELL: '/bin/bash',
};

let server;
let server2;
const result = {
  architecture: 'HERDR_V0_8_0',
  binary: { version, sha256: sha },
};

try {
  server = await startServer(env, root);
  const tOpen = performance.now();
  const workspace = json(env, ['workspace', 'create', '--cwd', '/home/hamza', '--label', 'primary', '--no-focus']);
  result.openInteractiveMs = performance.now() - tOpen;
  const primary = workspace.result.root_pane;
  result.primary = { workspace: workspace.result.workspace.workspace_id, pane: primary.pane_id, terminal: primary.terminal_id };

  const beforeMetrics = metrics(server.pid);
  await sleep(1000);
  const afterMetrics = metrics(server.pid);
  result.idleResources = {
    processCount: afterMetrics.processCount,
    rssKb: afterMetrics.rssKb,
    pssKb: afterMetrics.pssKb,
    cpuSecondsPerSecond: afterMetrics.cpuSeconds - beforeMetrics.cpuSeconds,
    processes: afterMetrics.processes,
  };

  const waitChild = spawn(HERDR, ['pane', 'wait-output', primary.pane_id, '--regex', '^HERDR_SEND_MARKER$', '--timeout', '3000'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let waitOut = '';
  waitChild.stdout.on('data', (chunk) => { waitOut += chunk.toString('utf8'); });
  await sleep(80);
  const sendStart = performance.now();
  run(env, ['pane', 'run', primary.pane_id, "printf 'HERDR_SEND_MARKER\\n'"]);
  const waitCode = await onceExit(waitChild);
  result.sendAndObserveMs = performance.now() - sendStart;
  result.sendMarkerSeen = waitCode === 0 && JSON.parse(waitOut).result.matched_line === 'HERDR_SEND_MARKER';

  run(env, ['pane', 'run', primary.pane_id, "for i in 1 2 3 4 5; do printf 'HERDR_DUP_%s\\n' \"$i\"; sleep 0.12; done"]);
  await sleep(80);
  const duplicateReads = [];
  let previous = '';
  for (let i = 0; i < 5; i += 1) {
    const text = readPane(env, primary.pane_id, 'recent-unwrapped', 40);
    duplicateReads.push({
      bytes: Buffer.byteLength(text),
      occurrences: (text.match(/HERDR_DUP_/g) || []).length,
      containsPreviousTail: previous ? text.includes(previous) : null,
    });
    const lines = text.trimEnd().split('\n');
    previous = lines.at(-2) || lines.at(-1) || '';
    await sleep(130);
  }
  result.repeatedReadSnapshots = duplicateReads;

  const immediateWorkspace = json(env, ['workspace', 'create', '--cwd', '/home/hamza', '--label', 'immediate', '--no-focus']);
  const immediatePane = immediateWorkspace.result.root_pane.pane_id;
  const immediateStart = performance.now();
  run(env, ['pane', 'run', immediatePane, "printf 'HERDR_IMMEDIATE_FIRST_BYTES\\n'; exit"]);
  let immediateText = '';
  let immediateFound = false;
  const immediateDeadline = Date.now() + 2500;
  while (Date.now() < immediateDeadline) {
    immediateText += readPane(env, immediatePane, 'recent-unwrapped', 20);
    if (immediateText.includes('HERDR_IMMEDIATE_FIRST_BYTES')) {
      immediateFound = true;
      break;
    }
    if (!paneList(env).some((entry) => entry.pane_id === immediatePane)) break;
    await sleep(20);
  }
  result.immediateOutput = {
    foundByPostRunRead: immediateFound,
    elapsedMs: performance.now() - immediateStart,
    paneSurvived: paneList(env).some((entry) => entry.pane_id === immediatePane),
  };

  const exitWorkspace = json(env, ['workspace', 'create', '--cwd', '/home/hamza', '--label', 'exit7', '--no-focus']);
  const exitPane = exitWorkspace.result.root_pane;
  const observer = spawn(HERDR, ['terminal', 'session', 'observe', exitPane.pane_id, '--cols', '80', '--rows', '24'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let observerOut = '';
  observer.stdout.on('data', (chunk) => { observerOut += chunk.toString('utf8'); });
  await waitFor(() => observerOut.includes('"terminal.frame"'), { description: 'nonzero observer initial frame' });
  run(env, ['pane', 'run', exitPane.pane_id, 'exit 7']);
  await onceExit(observer);
  const closeRecord = observerOut.trim().split('\n').map((line) => JSON.parse(line)).find((entry) => entry.type === 'terminal.closed');
  const serverLog = await readFile(path.join(root, 'config/herdr/sessions/agent3-v080-benchmark/herdr-server.log'), 'utf8');
  result.nonzeroExit = {
    terminalClosedReason: closeRecord?.reason || null,
    exitStatusExposedByTerminalApi: false,
    internalLogSawExit7: /pane child exited[^\n]*code: 7/.test(serverLog),
  };

  const noisyWorkspace = json(env, ['workspace', 'create', '--cwd', '/home/hamza', '--label', 'noisy', '--no-focus']);
  const noisyPane = noisyWorkspace.result.root_pane.pane_id;
  const noisyWait = spawn(HERDR, ['pane', 'wait-output', noisyPane, '--regex', '^HERDR_NOISY_DONE$', '--timeout', '10000'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await sleep(80);
  run(env, ['pane', 'run', noisyPane, "for i in $(seq 1 5000); do printf 'HERDR_NOISY_%04d_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n' \"$i\"; done; printf 'HERDR_NOISY_DONE\\n'"]);
  const noisyWaitCode = await onceExit(noisyWait);
  const noisyRead = readPane(env, noisyPane, 'recent', 80);
  const noisyLines = noisyRead.trimEnd().split('\n');
  const noisyFullRead = readPane(env, noisyPane, 'recent', 6000);
  result.noisyOutput = {
    waitSucceeded: noisyWaitCode === 0,
    boundedReadBytes: Buffer.byteLength(noisyRead),
    boundedReadLines: noisyLines.length,
    boundedReadFirstLine: noisyLines[0] || '',
    boundedReadHasFirstGeneratedLine: noisyRead.includes('HERDR_NOISY_0001_'),
    boundedReadHasLastGeneratedLine: noisyRead.includes('HERDR_NOISY_5000_'),
    fullReadBytes: Buffer.byteLength(noisyFullRead),
    fullReadHasFirstGeneratedLine: noisyFullRead.includes('HERDR_NOISY_0001_'),
    fullReadHasLastGeneratedLine: noisyFullRead.includes('HERDR_NOISY_5000_'),
    fullReadHasDone: noisyFullRead.includes('HERDR_NOISY_DONE'),
  };

  const tuiWorkspace = json(env, ['workspace', 'create', '--cwd', '/home/hamza', '--label', 'tui', '--no-focus']);
  const tuiPane = tuiWorkspace.result.root_pane.pane_id;
  const tuiCommand = "python3 -c \"import sys,time; sys.stdout.write('\\x1b[?1049h\\x1b[2J\\x1b[HHERDR_ALT_TOP\\x1b[10;20HHERDR_ALT_MIDDLE'); sys.stdout.flush(); time.sleep(5)\"";
  run(env, ['pane', 'run', tuiPane, tuiCommand]);
  await sleep(200);
  const tuiRecent = readPane(env, tuiPane, 'recent-unwrapped', 40);
  const tuiVisible = readPane(env, tuiPane, 'visible', 24);
  result.tui = {
    recentTopPresent: tuiRecent.includes('HERDR_ALT_TOP'),
    recentMiddlePresent: tuiRecent.includes('HERDR_ALT_MIDDLE'),
    visibleBytes: Buffer.byteLength(tuiVisible),
  };
  run(env, ['pane', 'send-keys', tuiPane, 'ctrl+c'], { allowFailure: true });

  // Close experiment-only workspaces that are no longer needed so restart isolates one live process.
  const primaryWorkspaceId = workspace.result.workspace.workspace_id;
  for (const entry of json(env, ['workspace', 'list']).result.workspaces) {
    if (entry.workspace_id !== primaryWorkspaceId) run(env, ['workspace', 'close', entry.workspace_id], { allowFailure: true });
  }

  run(env, ['pane', 'run', primary.pane_id, "bash -lc 'i=0; while :; do printf \\\"HERDR_RESTART_TICK:%s\\\\n\\\" \\\"$i\\\"; i=$((i+1)); sleep 0.1; done'"]);
  await sleep(200);
  const processBefore = processInfo(env, primary.pane_id);
  const shellBefore = processBefore.shell_pid;
  const foregroundBefore = processBefore.foreground_process_group_id;
  const serverBefore = server.pid;
  const terminalBefore = paneList(env).find((entry) => entry.pane_id === primary.pane_id)?.terminal_id;
  run(env, ['server', 'stop']);
  await onceExit(server);
  await sleep(150);
  const survivesStop = {
    server: spawnSync('bash', ['-lc', `kill -0 ${serverBefore} 2>/dev/null`]).status === 0,
    shell: spawnSync('bash', ['-lc', `kill -0 ${shellBefore} 2>/dev/null`]).status === 0,
    foreground: spawnSync('bash', ['-lc', `kill -0 ${foregroundBefore} 2>/dev/null`]).status === 0,
  };
  server2 = await startServer(env, root, '-restart');
  const restoredPane = await waitFor(() => paneList(env).find((entry) => entry.pane_id === primary.pane_id), {
    description: 'restored primary pane',
  });
  const processAfter = processInfo(env, primary.pane_id);
  result.serverRestart = {
    serverPidBefore: serverBefore,
    serverPidAfter: server2.pid,
    shellPidBefore: shellBefore,
    shellPidAfter: processAfter.shell_pid,
    foregroundPidBefore: foregroundBefore,
    foregroundPidAfter: processAfter.foreground_process_group_id,
    terminalIdBefore: terminalBefore,
    terminalIdAfter: restoredPane.terminal_id,
    survivesStop,
    paneIdentityRestored: restoredPane.pane_id === primary.pane_id,
    arbitraryForegroundPreserved: foregroundBefore === processAfter.foreground_process_group_id,
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const candidate of [server2, server]) {
    if (candidate && candidate.exitCode === null) {
      run(env, ['server', 'stop'], { allowFailure: true, timeout: 3000 });
      await Promise.race([onceExit(candidate), sleep(500)]).catch(() => {});
    }
  }
  await rm(root, { recursive: true, force: true });
}
