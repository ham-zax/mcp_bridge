import crypto from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const WAIT_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_LOCK_WAIT_MS = 250;
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['matched', 'timeout', 'cancelled', 'failed']);

export class WaitError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'WaitError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function validateName(name) {
  if (typeof name !== 'string' || !WAIT_NAME_RE.test(name)) {
    throw new WaitError('INVALID_WAIT_NAME', 'wait name must match ^[A-Za-z0-9._-]{1,64}$');
  }
  return name;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new WaitError('WAIT_ABORTED', 'wait request was aborted');
}

function lockAddress(rootDir, name) {
  if (process.platform !== 'linux') {
    throw new WaitError('INVALID_WAIT_CONFIG', 'cross-process wait locks require Linux abstract Unix sockets');
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'unknown';
  const digest = crypto.createHash('sha256')
    .update(`${uid}\0${rootDir}\0${validateName(name)}`)
    .digest('hex');
  return `\0mcp-dev-wait-${digest}`;
}

function closeLockServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function tryBindLock(address, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    let settled = false;
    let aborted = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const abortError = () => new WaitError('WAIT_ABORTED', 'wait request was aborted');
    const onAbort = () => {
      aborted = true;
      if (server.listening) {
        void closeLockServer(server).then(
          () => finish(reject, abortError()),
          (error) => finish(reject, error),
        );
      }
    };
    const onError = (error) => {
      if (aborted || signal?.aborted) {
        finish(reject, abortError());
        return;
      }
      if (error?.code === 'EADDRINUSE') {
        finish(resolve, null);
        return;
      }
      finish(reject, new WaitError('WAIT_LOCK_ERROR', `wait lock bind failed: ${error.message}`));
    };
    const onListening = () => {
      if (aborted || signal?.aborted) {
        void closeLockServer(server).then(
          () => finish(reject, abortError()),
          (error) => finish(reject, error),
        );
        return;
      }
      finish(resolve, server);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(address);
  });
}

function delay(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, new WaitError('WAIT_ABORTED', 'wait request was aborted'));
    const timer = setTimeout(() => finish(resolve), ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export class WaitStore {
  constructor({ stateDir } = {}) {
    if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) {
      throw new WaitError('INVALID_WAIT_CONFIG', 'stateDir must be an absolute path');
    }
    this.stateDir = stateDir;
    this.rootDir = path.join(stateDir, 'waits');
    this.lockNamespaceRoot = null;
  }

  fileFor(name) {
    return path.join(this.rootDir, `${validateName(name)}.json`);
  }

  async ensureRoot() {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    await chmod(this.rootDir, 0o700);
    this.lockNamespaceRoot = await realpath(this.rootDir);
  }

  async read(name) {
    const file = this.fileFor(name);
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (!parsed || parsed.version !== 1 || parsed.name !== name || typeof parsed.status !== 'string') {
        throw new Error('invalid wait record');
      }
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (error instanceof WaitError) throw error;
      throw new WaitError('WAIT_STATE_CORRUPT', `invalid wait state for ${name}: ${error.message}`);
    }
  }

  async write(record) {
    if (!record || typeof record !== 'object') throw new WaitError('WAIT_STATE_CORRUPT', 'wait record must be an object');
    const name = validateName(record.name);
    await this.ensureRoot();
    const file = this.fileFor(name);
    const temp = path.join(this.rootDir, `.${name}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const payload = `${JSON.stringify({ ...record, version: 1 })}\n`;
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(payload);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, file);
      await chmod(file, 0o600);
    } finally {
      await unlink(temp).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
    return { ...record, version: 1 };
  }

  async create(record) {
    const existing = await this.read(record.name);
    if (existing) throw new WaitError('WAIT_CONFLICT', `wait already exists: ${record.name}`);
    return this.write(record);
  }

  async acquire(name, { signal, maxWaitMs = DEFAULT_LOCK_WAIT_MS } = {}) {
    validateName(name);
    if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0) {
      throw new WaitError('INVALID_WAIT_CONFIG', 'maxWaitMs must be a non-negative integer');
    }
    await this.ensureRoot();
    throwIfAborted(signal);
    const address = lockAddress(this.lockNamespaceRoot, name);
    const deadline = Date.now() + maxWaitMs;

    while (true) {
      throwIfAborted(signal);
      const server = await tryBindLock(address, signal);
      if (server) {
        try {
          throwIfAborted(signal);
        } catch (error) {
          await closeLockServer(server);
          throw error;
        }
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          await closeLockServer(server);
        };
      }
      if (Date.now() >= deadline) {
        throw new WaitError('WAIT_BUSY', `wait ${name} is busy`);
      }
      await delay(Math.min(10, Math.max(1, deadline - Date.now())), signal);
    }
  }

  async withLock(name, fn, { signal, maxWaitMs = DEFAULT_LOCK_WAIT_MS } = {}) {
    if (typeof fn !== 'function') throw new WaitError('INVALID_WAIT_CONFIG', 'wait lock callback is required');
    throwIfAborted(signal);
    const release = await this.acquire(name, { signal, maxWaitMs });
    try {
      throwIfAborted(signal);
      return await fn();
    } finally {
      await release();
    }
  }

  async gc(nowMs = Date.now(), retentionMs = DEFAULT_RETENTION_MS) {
    await this.ensureRoot();
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const name = entry.name.slice(0, -5);
      let record;
      try {
        record = await this.read(name);
      } catch {
        continue;
      }
      if (!record || !TERMINAL_STATUSES.has(record.status)) continue;
      if (!Number.isFinite(record.completedAtMs) || nowMs - record.completedAtMs < retentionMs) continue;
      await unlink(this.fileFor(name)).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      removed += 1;
    }
    return removed;
  }
}
