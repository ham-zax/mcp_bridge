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
import { withMutationPath } from './mutation-coordinator.mjs';

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

function validateExactEdits(buffer, edits) {
  const content = normalizeExactText(buffer.toString('utf8'));
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

export function createStrictEditOperations(edits) {
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
      });
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

export async function runEdit({ pathMode = 'workspace', defaultCwd, workspaceRoot, path, edits }, signal) {
  const policy = await resolveFilePolicy({ pathMode, workspaceRoot, defaultCwd });
  const target = policy.pathMode === 'user'
    ? await resolveUserPath(policy.root, path)
    : await resolveExistingWorkspacePath(policy.root, path);
  const tool = createEditTool(policy.root, { operations: createStrictEditOperations(edits) });
  try {
    return await tool.execute(randomUUID(), { path: target, edits }, signal);
  } catch (error) {
    throw modelFacingPathError(error, target, path);
  }
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
