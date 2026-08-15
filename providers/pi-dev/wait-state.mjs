import crypto from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

const WAIT_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_LOCK_WAIT_MS = 250;
const STALE_UNKNOWN_LOCK_MS = 15000;
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

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
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
    this.lockDir = path.join(this.rootDir, '.locks');
  }

  fileFor(name) {
    return path.join(this.rootDir, `${validateName(name)}.json`);
  }

  lockFileFor(name) {
    return path.join(this.lockDir, `${validateName(name)}.lock`);
  }

  async ensureRoot() {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    await chmod(this.rootDir, 0o700);
    await mkdir(this.lockDir, { recursive: true, mode: 0o700 });
    await chmod(this.lockDir, 0o700);
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

  async lockIsStale(file) {
    try {
      const [raw, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      let owner;
      try {
        owner = JSON.parse(raw);
      } catch {
        owner = null;
      }
      if (owner && Number.isSafeInteger(owner.pid) && owner.pid > 0) return !processExists(owner.pid);
      return Date.now() - info.mtimeMs > STALE_UNKNOWN_LOCK_MS;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async acquire(name, { signal, maxWaitMs = DEFAULT_LOCK_WAIT_MS } = {}) {
    validateName(name);
    if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0) {
      throw new WaitError('INVALID_WAIT_CONFIG', 'maxWaitMs must be a non-negative integer');
    }
    await this.ensureRoot();
    throwIfAborted(signal);
    const file = this.lockFileFor(name);
    const deadline = Date.now() + maxWaitMs;

    while (true) {
      throwIfAborted(signal);
      try {
        const handle = await open(file, 'wx', 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAtMs: Date.now() })}\n`);
          await handle.sync();
        } finally {
          await handle.close();
        }
        throwIfAborted(signal);
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          await unlink(file).catch((error) => {
            if (error?.code !== 'ENOENT') throw error;
          });
        };
      } catch (error) {
        if (error instanceof WaitError) {
          await unlink(file).catch(() => {});
          throw error;
        }
        if (error?.code !== 'EEXIST') throw error;
      }

      if (await this.lockIsStale(file)) {
        await unlink(file).catch((error) => {
          if (error?.code !== 'ENOENT') throw error;
        });
        continue;
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
