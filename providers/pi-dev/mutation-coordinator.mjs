import fs from 'node:fs/promises';
import path from 'node:path';

const locks = new Map();

function assertCanonicalAbsolutePath(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) {
    throw new Error('mutation coordinator requires a canonical absolute path');
  }
}

async function canonicalMutationTarget(target) {
  assertCanonicalAbsolutePath(target);
  try {
    return await fs.realpath(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const parent = await fs.realpath(path.dirname(target));
    return path.join(parent, path.basename(target));
  }
}

function releaseFactory(target, state) {
  let released = false;
  return () => {
    if (released) return;
    released = true;

    const next = state.waiters.shift();
    if (next) {
      next();
      return;
    }

    state.locked = false;
    if (locks.get(target) === state) locks.delete(target);
  };
}

async function acquire(target) {
  let state = locks.get(target);
  if (!state) {
    state = { locked: false, waiters: [] };
    locks.set(target, state);
  }

  if (!state.locked) {
    state.locked = true;
    return releaseFactory(target, state);
  }

  await new Promise(resolve => state.waiters.push(resolve));
  return releaseFactory(target, state);
}

export async function withMutationPaths(targets, fn) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('mutation coordinator requires at least one target path');
  }
  if (typeof fn !== 'function') throw new Error('mutation coordinator requires a callback');

  const canonicalTargets = await Promise.all(targets.map(canonicalMutationTarget));
  const orderedTargets = [...new Set(canonicalTargets)].sort();
  const releases = [];

  try {
    for (const target of orderedTargets) releases.push(await acquire(target));
    return await fn();
  } finally {
    for (let i = releases.length - 1; i >= 0; i -= 1) releases[i]();
  }
}

export function withMutationPath(target, fn) {
  return withMutationPaths([target], fn);
}
