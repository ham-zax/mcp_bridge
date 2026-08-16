import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createEditTool,
  createReadTool,
  createWriteTool
} from '@earendil-works/pi-coding-agent';
import {
  canonicalDefaultCwd,
  canonicalWorkspaceRoot,
  resolveExistingWorkspacePath,
  resolveNewWorkspacePath,
  resolveUserPath
} from './boundary.mjs';
import { withMutationPath, withMutationPaths } from './mutation-coordinator.mjs';

function normalizeExactText(text) {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function exactOccurrenceCount(content, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = content.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + 1;
  }
}

function decodeValidUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error('edit target must be valid UTF-8 text');
  }
}

function validateExactEdits(buffer, edits) {
  const content = normalizeExactText(decodeValidUtf8(buffer));
  for (let i = 0; i < edits.length; i += 1) {
    const oldText = normalizeExactText(edits[i].oldText);
    if (!oldText) throw new Error(`edits[${i}].oldText must not be empty`);
    const count = exactOccurrenceCount(content, oldText);
    if (count === 0) throw new Error(`edits[${i}] exact text was not found; fuzzy matching is disabled`);
    if (count > 1) throw new Error(`edits[${i}] exact text is not unique (${count} occurrences)`);
  }
}

function modelFacingPathError(error, absolutePath, relativePath) {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = message.split(absolutePath).join(relativePath);
  const wrapped = new Error(sanitized);
  if (error && typeof error === 'object' && 'code' in error) wrapped.code = error.code;
  return wrapped;
}

export function createStrictEditOperations(edits, signal) {
  let snapshot = null;
  let snapshotPath = null;
  return {
    access: absolutePath => fs.access(absolutePath, constants.R_OK | constants.W_OK),
    readFile: async absolutePath => {
      const buffer = await fs.readFile(absolutePath);
      validateExactEdits(buffer, edits);
      snapshot = Buffer.from(buffer);
      snapshotPath = absolutePath;
      return buffer;
    },
    writeFile: async (absolutePath, content) => {
      if (!snapshot || snapshotPath !== absolutePath) throw new Error('edit snapshot is missing');
      await withMutationPath(absolutePath, async () => {
        const current = await fs.readFile(absolutePath);
        if (!current.equals(snapshot)) throw new Error('file changed during edit; reread and reconcile');
        await fs.writeFile(absolutePath, content, 'utf8');
      }, { signal });
    }
  };
}

const exclusiveWriteOperations = {
  mkdir: async dir => {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error('write parent must be a directory');
  },
  writeFile: (absolutePath, content) => fs.writeFile(
    absolutePath,
    content,
    { encoding: 'utf8', flag: 'wx' }
  )
};

async function resolveFilePolicy({ pathMode = 'workspace', workspaceRoot, defaultCwd }) {
  if (pathMode === 'workspace') {
    const root = await canonicalWorkspaceRoot(workspaceRoot);
    return { root, pathMode };
  }
  if (pathMode === 'user') {
    const root = await canonicalDefaultCwd(defaultCwd);
    return { root, pathMode };
  }
  throw new Error('MCP_DEV_PATH_MODE must be workspace or user');
}

export async function runRead({ pathMode = 'workspace', defaultCwd, workspaceRoot, path, offset, limit }, signal) {
  const policy = await resolveFilePolicy({ pathMode, workspaceRoot, defaultCwd });
  const target = policy.pathMode === 'user'
    ? await resolveUserPath(policy.root, path)
    : await resolveExistingWorkspacePath(policy.root, path);
  const tool = createReadTool(policy.root);
  try {
    return await tool.execute(randomUUID(), { path: target, offset, limit }, signal);
  } catch (error) {
    throw modelFacingPathError(error, target, path);
  }
}

export async function runEdit({ pathMode = 'workspace', defaultCwd, workspaceRoot, targets }, signal) {
  const policy = await resolveFilePolicy({ pathMode, workspaceRoot, defaultCwd });
  const requestedTargets = Array.isArray(targets) ? targets : [];
  if (requestedTargets.length === 0) throw new Error('edit targets must contain at least one file');

  const resolved = [];
  for (const request of requestedTargets) {
    const canonicalPath = policy.pathMode === 'user'
      ? await resolveUserPath(policy.root, request.path)
      : await resolveExistingWorkspacePath(policy.root, request.path);
    resolved.push({ requestedPath: request.path, canonicalPath, edits: request.edits });
  }

  const seen = new Set();
  for (const target of resolved) {
    if (seen.has(target.canonicalPath)) {
      throw new Error(`duplicate edit target resolves to the same file: ${target.requestedPath}`);
    }
    seen.add(target.canonicalPath);
  }

  return withMutationPaths(resolved.map(target => target.canonicalPath), async () => {
    const plans = [];
    for (const target of resolved) {
      const stat = await fs.stat(target.canonicalPath);
      if (!stat.isFile()) throw new Error(`${target.requestedPath} must resolve to a regular file`);
      const snapshot = await fs.readFile(target.canonicalPath);
      decodeValidUtf8(snapshot);
      validateExactEdits(snapshot, target.edits);
      let proposed = null;
      const tool = createEditTool(policy.root, {
        operations: {
          access: absolutePath => fs.access(absolutePath, constants.R_OK | constants.W_OK),
          readFile: async () => Buffer.from(snapshot),
          writeFile: async (_absolutePath, content) => { proposed = content; }
        }
      });
      let result;
      try {
        result = await tool.execute(randomUUID(), {
          path: target.canonicalPath,
          edits: target.edits
        }, signal);
      } catch (error) {
        throw modelFacingPathError(error, target.canonicalPath, target.requestedPath);
      }
      if (proposed === null) throw new Error(`edit planning produced no output for ${target.requestedPath}`);
      plans.push({ ...target, identity: { dev: stat.dev, ino: stat.ino }, snapshot, proposed, diff: result.details?.diff ?? '' });
    }

    for (const plan of plans) {
      const current = await fs.readFile(plan.canonicalPath);
      if (!current.equals(plan.snapshot)) {
        throw new Error(`${plan.requestedPath} changed during edit; reread and reconcile`);
      }
      await fs.writeFile(plan.canonicalPath, plan.proposed, 'utf8');
    }

    const results = plans.map(plan => ({ path: plan.requestedPath, diff: plan.diff }));
    return {
      targets: results,
      details: results.length === 1 ? { diff: results[0].diff } : undefined
    };
  }, { signal });
}

export async function runWrite({ pathMode = 'workspace', defaultCwd, workspaceRoot, path, content }, signal) {
  const policy = await resolveFilePolicy({ pathMode, workspaceRoot, defaultCwd });
  const target = policy.pathMode === 'user'
    ? await resolveUserPath(policy.root, path, { mustExist: false })
    : await resolveNewWorkspacePath(policy.root, path);
  const tool = createWriteTool(policy.root, { operations: exclusiveWriteOperations });
  try {
    return await tool.execute(randomUUID(), { path: target, content }, signal);
  } catch (error) {
    if (error?.code === 'EEXIST' || /EEXIST/.test(error?.message ?? '')) {
      throw new Error('file already exists; use edit for existing files');
    }
    throw modelFacingPathError(error, target, path);
  }
}
