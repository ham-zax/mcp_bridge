import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import { TerminalError } from './protocol.mjs';
import { validateSessionName } from './tmux.mjs';

const DEFAULT_READY_TIMEOUT_MS = 3000;
const DEFAULT_POLL_INTERVAL_MS = 50;
const WSLG_RUNTIME_DIR = '/mnt/wslg/runtime-dir';
const WSLG_WAYLAND = `${WSLG_RUNTIME_DIR}/wayland-0`;
const WSLG_X11 = ['/tmp/.X11-unix/X0', '/mnt/wslg/.X11-unix/X0'];
const WSLG_PULSE = '/mnt/wslg/PulseServer';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isExecutable(candidate, accessFn) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  try {
    await accessFn(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveKittyBinary(env, accessFn) {
  const candidates = [];
  if (env.MCP_TERMINAL_KITTY_BIN) candidates.push(env.MCP_TERMINAL_KITTY_BIN);
  if (env.HOME) candidates.push(path.join(env.HOME, '.local', 'kitty.app', 'bin', 'kitty'));
  for (const entry of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(entry, 'kitty'));
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isExecutable(candidate, accessFn)) return candidate;
  }
  return null;
}

async function isSocket(candidate, statFn) {
  try {
    return (await statFn(candidate)).isSocket() === true;
  } catch {
    return false;
  }
}

async function frontendEnv(env, statFn) {
  const childEnv = { ...env };
  if (!childEnv.WAYLAND_DISPLAY && await isSocket(WSLG_WAYLAND, statFn)) {
    childEnv.XDG_RUNTIME_DIR = WSLG_RUNTIME_DIR;
    childEnv.WAYLAND_DISPLAY = 'wayland-0';
  }
  if (!childEnv.DISPLAY) {
    for (const candidate of WSLG_X11) {
      if (await isSocket(candidate, statFn)) {
        childEnv.DISPLAY = ':0';
        break;
      }
    }
  }
  if (!childEnv.PULSE_SERVER && await isSocket(WSLG_PULSE, statFn)) {
    childEnv.PULSE_SERVER = `unix:${WSLG_PULSE}`;
  }
  return childEnv;
}

async function defaultKillProcessGroup(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function fallbackMessage(wslTermPath, name) {
  return `${wslTermPath} attach ${name}`;
}

export function createFrontendController({
  client,
  env = process.env,
  repoRoot = path.resolve(import.meta.dirname, '../..'),
  accessFn = access,
  statFn = stat,
  spawnFn = spawn,
  killProcessGroup = defaultKillProcessGroup,
  sleep = delay,
  now = Date.now,
  readinessTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}) {
  const inflight = new Map();
  const wslTermPath = path.join(repoRoot, 'bin', 'wsl-term');

  async function sessionState(name) {
    if (!client || typeof client.request !== 'function') {
      throw new TypeError('frontend controller requires a broker client with request()');
    }
    const result = await client.request('session.list', {});
    const session = result.sessions.find((candidate) => candidate.name === name);
    if (!session) throw new TerminalError('SESSION_NOT_FOUND', `terminal session not found: ${name}`);
    return session;
  }

  async function waitForAttachmentProgress(name, state) {
    if (!state.humanLease || state.humanAttached) return state;
    const deadline = now() + readinessTimeoutMs;
    let current = state;
    while (current.humanLease && !current.humanAttached) {
      if (now() >= deadline) {
        throw new TerminalError(
          'FRONTEND_NOT_READY',
          `human frontend attachment did not settle for ${name}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
        );
      }
      await sleep(pollIntervalMs);
      current = await sessionState(name);
    }
    return current;
  }

  async function waitForPresented(name, child, launchState) {
    const deadline = now() + readinessTimeoutMs;
    while (true) {
      if (launchState.error) {
        throw new TerminalError(
          'FRONTEND_LAUNCH_FAILED',
          `Kitty failed to launch for ${name}: ${launchState.error.message}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
        );
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new TerminalError(
          'FRONTEND_LAUNCH_FAILED',
          `Kitty exited before the frontend was ready for ${name}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
        );
      }
      const state = await sessionState(name);
      if (state.humanAttached) return state;
      if (now() >= deadline) {
        throw new TerminalError(
          'FRONTEND_NOT_READY',
          `Kitty did not establish a collaborative frontend for ${name}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
        );
      }
      await sleep(pollIntervalMs);
    }
  }

  async function doEnsurePresented(name) {
    let state = await sessionState(name);
    if (state.humanAttached) return { name, status: 'reused' };

    state = await waitForAttachmentProgress(name, state);
    if (state.humanAttached) return { name, status: 'reused' };

    const kittyBin = await resolveKittyBinary(env, accessFn);
    if (!kittyBin) {
      throw new TerminalError(
        'FRONTEND_UNAVAILABLE',
        `Kitty is unavailable for ${name}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
      );
    }

    const childEnv = await frontendEnv(env, statFn);
    let child;
    try {
      child = spawnFn(
        kittyBin,
        ['--title', `Terminal: ${name}`, wslTermPath, 'present', name],
        { detached: true, stdio: 'ignore', env: childEnv },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TerminalError(
        'FRONTEND_LAUNCH_FAILED',
        `Kitty failed to start for ${name}: ${message}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
      );
    }
    const launchState = { error: null };
    if (child && typeof child.once === 'function') {
      child.once('error', (error) => { launchState.error = error; });
    }
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
      throw new TerminalError(
        'FRONTEND_LAUNCH_FAILED',
        `Kitty did not start for ${name}; attach manually with ${fallbackMessage(wslTermPath, name)}`,
      );
    }

    try {
      await waitForPresented(name, child, launchState);
    } catch (error) {
      await killProcessGroup(child.pid);
      throw error;
    }
    if (typeof child.unref === 'function') child.unref();
    return { name, status: 'launch-attempted' };
  }

  function ensurePresented(name) {
    validateSessionName(name);
    const existing = inflight.get(name);
    if (existing) return existing;
    const operation = doEnsurePresented(name).finally(() => {
      if (inflight.get(name) === operation) inflight.delete(name);
    });
    inflight.set(name, operation);
    return operation;
  }

  return { ensurePresented };
}
