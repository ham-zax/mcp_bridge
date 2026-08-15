import { WaitError } from './wait-state.mjs';

export const DEFAULT_WAIT_TIMEOUT_SECONDS = 300;
export const MAX_WAIT_TIMEOUT_SECONDS = 86400;
export const DEFAULT_HOLD_SECONDS = 10;
export const MAX_HOLD_SECONDS = 15;
export const MIN_POLL_MS = 250;
export const WAIT_LOCK_ACQUIRE_MS = 250;
export const COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(['matched', 'timeout', 'cancelled', 'failed']);

function throwIfAborted(signal) {
  if (signal?.aborted) throw new WaitError('WAIT_ABORTED', 'wait request was aborted');
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]));
  }
  return value;
}

function definitionKey(definition) {
  return JSON.stringify(normalizeJson(definition));
}

function integerInRange(value, field, min, max, fallback) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new WaitError('INVALID_WAIT_REQUEST', `${field} must be an integer from ${min} to ${max}`);
  }
  return resolved;
}

function sourceResultStatus(value) {
  return ['pending', 'matched', 'failed'].includes(value) ? value : null;
}

function publicResult(record) {
  const result = {
    status: record.status,
    name: record.name,
  };
  if (record.deadlineAtMs !== undefined) result.deadlineAtMs = record.deadlineAtMs;
  if (record.evidence !== undefined) result.evidence = record.evidence;
  if (record.code !== undefined) result.code = record.code;
  if (record.details !== undefined) result.details = record.details;
  return result;
}

function defaultSleep(ms, signal) {
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

export class WaitEngine {
  constructor({ store, sources, now = () => Date.now(), sleep = defaultSleep } = {}) {
    if (!store || typeof store.withLock !== 'function') throw new TypeError('store is required');
    if (!sources || typeof sources !== 'object') throw new TypeError('sources are required');
    this.store = store;
    this.sources = sources;
    this.now = now;
    this.sleep = sleep;
  }

  sourceFor(condition) {
    const kind = condition?.kind;
    const source = typeof kind === 'string' ? this.sources[kind] : null;
    if (!source || typeof source.arm !== 'function' || typeof source.check !== 'function') {
      throw new WaitError('INVALID_WAIT_CONDITION', `unsupported wait condition: ${String(kind)}`);
    }
    return source;
  }

  async applySourceResult(record, result, nowMs) {
    if (!result || !sourceResultStatus(result.status)) {
      throw new WaitError('WAIT_SOURCE_ERROR', 'wait source returned an invalid result');
    }
    const next = {
      ...record,
      baseline: result.baseline === undefined ? record.baseline : result.baseline,
      sourceArmed: true,
      lastCheckedAtMs: nowMs,
    };
    if (result.status === 'pending') {
      next.status = 'pending';
      delete next.evidence;
      delete next.code;
      delete next.details;
    } else {
      next.status = result.status;
      next.completedAtMs = nowMs;
      if (result.evidence !== undefined) next.evidence = result.evidence;
      if (result.code !== undefined) next.code = result.code;
      if (result.details !== undefined) next.details = result.details;
    }
    return this.store.write(next);
  }

  async armIfNeeded(record, source, signal) {
    if (record.sourceArmed === true) return record;
    throwIfAborted(signal);
    const result = await source.arm(record.condition, signal);
    throwIfAborted(signal);
    return this.applySourceResult(record, result, this.now());
  }

  async checkOnce(record, source, signal) {
    throwIfAborted(signal);
    const result = await source.check(record, signal);
    throwIfAborted(signal);
    return this.applySourceResult(record, result, this.now());
  }

  pollInterval(source, condition) {
    const candidate = typeof source.pollIntervalMs === 'function'
      ? source.pollIntervalMs(condition)
      : source.pollIntervalMs;
    return Math.max(MIN_POLL_MS, Number.isFinite(candidate) ? Math.floor(candidate) : MIN_POLL_MS);
  }

  async run(args, signal) {
    const name = args?.name;
    if (typeof name !== 'string') throw new WaitError('INVALID_WAIT_NAME', 'wait name is required');
    const holdSeconds = integerInRange(
      args.hold_seconds,
      'hold_seconds',
      0,
      MAX_HOLD_SECONDS,
      DEFAULT_HOLD_SECONDS,
    );
    throwIfAborted(signal);

    return this.store.withLock(name, async () => {
      throwIfAborted(signal);
      await this.store.gc(this.now(), COMPLETED_RETENTION_MS);
      let record = await this.store.read(name);

      if (args.cancel === true) {
        if (args.condition !== undefined || args.timeout_seconds !== undefined) {
          throw new WaitError('INVALID_WAIT_REQUEST', 'cancel cannot include condition or timeout_seconds');
        }
        if (!record) throw new WaitError('WAIT_NOT_FOUND', `wait not found: ${name}`);
        if (TERMINAL_STATUSES.has(record.status)) return publicResult(record);
        record = await this.store.write({
          ...record,
          status: 'cancelled',
          completedAtMs: this.now(),
        });
        return publicResult(record);
      }

      if (args.condition !== undefined) {
        const timeoutSeconds = integerInRange(
          args.timeout_seconds,
          'timeout_seconds',
          1,
          MAX_WAIT_TIMEOUT_SECONDS,
          DEFAULT_WAIT_TIMEOUT_SECONDS,
        );
        const definition = {
          condition: normalizeJson(args.condition),
          timeoutSeconds,
        };
        if (record) {
          if (definitionKey(record.definition) !== definitionKey(definition)) {
            throw new WaitError('WAIT_CONFLICT', `wait ${name} already exists with a different definition`);
          }
        } else {
          const armedAtMs = this.now();
          record = await this.store.create({
            name,
            definition,
            condition: definition.condition,
            timeoutSeconds,
            armedAtMs,
            deadlineAtMs: armedAtMs + timeoutSeconds * 1000,
            status: 'pending',
            sourceArmed: false,
            baseline: null,
          });
        }
      } else if (!record) {
        throw new WaitError('WAIT_NOT_FOUND', `wait not found: ${name}`);
      }

      if (TERMINAL_STATUSES.has(record.status)) return publicResult(record);
      const source = this.sourceFor(record.condition);
      record = await this.armIfNeeded(record, source, signal);
      if (TERMINAL_STATUSES.has(record.status)) return publicResult(record);

      const callDeadlineAtMs = this.now() + holdSeconds * 1000;
      const pollMs = this.pollInterval(source, record.condition);
      while (true) {
        throwIfAborted(signal);
        const nowMs = this.now();
        if (nowMs >= record.deadlineAtMs) {
          record = await this.store.write({ ...record, status: 'timeout', completedAtMs: nowMs });
          return publicResult(record);
        }
        record = await this.checkOnce(record, source, signal);
        if (TERMINAL_STATUSES.has(record.status)) return publicResult(record);
        if (holdSeconds === 0 || this.now() >= callDeadlineAtMs) return publicResult(record);

        const remainingCall = callDeadlineAtMs - this.now();
        const remainingWait = record.deadlineAtMs - this.now();
        if (remainingCall <= 0) return publicResult(record);
        if (remainingWait <= 0) continue;
        try {
          await this.sleep(Math.min(pollMs, remainingCall, remainingWait), signal);
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'WAIT_ABORTED') {
            throw new WaitError('WAIT_ABORTED', 'wait request was aborted');
          }
          throw error;
        }
      }
    }, { signal, maxWaitMs: WAIT_LOCK_ACQUIRE_MS });
  }
}
