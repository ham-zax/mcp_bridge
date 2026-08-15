import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveUserCwd, resolveUserPath } from './boundary.mjs';
import { withMutationPaths } from './mutation-coordinator.mjs';

const BEGIN_PATCH = '*** Begin Patch';
const END_PATCH = '*** End Patch';
const UPDATE_PREFIX = '*** Update File: ';
const ADD_PREFIX = '*** Add File: ';
const DELETE_PREFIX = '*** Delete File: ';
const MOVE_PREFIX = '*** Move to: ';

function patchError(message, code = 'PATCH_INVALID') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requirePatchPath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw patchError(`${label} path must be non-empty`);
  }
  if (value.includes('\0')) throw patchError(`${label} path contains a NUL byte`);
  return value;
}

function isOperationBoundary(line) {
  return line === END_PATCH ||
    line.startsWith(UPDATE_PREFIX) ||
    line.startsWith(ADD_PREFIX) ||
    line.startsWith(DELETE_PREFIX);
}

function normalizePatchLines(text) {
  if (typeof text !== 'string' || text.length === 0) throw patchError('patch must be non-empty');
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function parseHunk(lines, start) {
  if (lines[start] !== '@@') throw patchError('update hunk must begin with @@');
  const hunkLines = [];
  let index = start + 1;
  let changes = 0;
  let anchors = 0;

  while (index < lines.length && lines[index] !== '@@' && !isOperationBoundary(lines[index])) {
    const line = lines[index];
    const marker = line[0];
    const text = line.slice(1);
    if (![' ', '+', '-'].includes(marker)) {
      throw patchError(`update hunk line must use space, +, or - prefix: ${line}`);
    }
    if (marker === '+') {
      hunkLines.push({ kind: 'add', text });
      changes += 1;
    } else if (marker === '-') {
      hunkLines.push({ kind: 'delete', text });
      changes += 1;
      anchors += 1;
    } else {
      hunkLines.push({ kind: 'context', text });
      anchors += 1;
    }
    index += 1;
  }

  if (hunkLines.length === 0) throw patchError('update hunk must not be empty');
  if (changes === 0) throw patchError('update hunk must contain at least one + or - line');
  if (anchors === 0) throw patchError('update hunk must contain exact context or deleted text');
  return { hunk: { lines: hunkLines }, next: index };
}

export function parsePatch(text) {
  const lines = normalizePatchLines(text);
  if (lines[0] !== BEGIN_PATCH) throw patchError(`patch must begin with ${BEGIN_PATCH}`);

  const operations = [];
  let index = 1;
  let ended = false;

  while (index < lines.length) {
    const line = lines[index];
    if (line === END_PATCH) {
      ended = true;
      index += 1;
      break;
    }

    if (line.startsWith(UPDATE_PREFIX)) {
      const filePath = requirePatchPath(line.slice(UPDATE_PREFIX.length), 'update');
      index += 1;
      let moveTo = null;
      if (lines[index]?.startsWith(MOVE_PREFIX)) {
        moveTo = requirePatchPath(lines[index].slice(MOVE_PREFIX.length), 'move destination');
        index += 1;
      }
      const hunks = [];
      while (lines[index] === '@@') {
        const parsed = parseHunk(lines, index);
        hunks.push(parsed.hunk);
        index = parsed.next;
      }
      if (hunks.length === 0 && moveTo === null) {
        throw patchError(`update ${filePath} must contain at least one @@ hunk`);
      }
      operations.push({ type: 'update', path: filePath, moveTo, hunks });
      continue;
    }

    if (line.startsWith(ADD_PREFIX)) {
      const filePath = requirePatchPath(line.slice(ADD_PREFIX.length), 'add');
      index += 1;
      const contentLines = [];
      while (index < lines.length && !isOperationBoundary(lines[index])) {
        const bodyLine = lines[index];
        if (!bodyLine.startsWith('+')) {
          throw patchError(`add file line must use + prefix: ${bodyLine}`);
        }
        contentLines.push(bodyLine.slice(1));
        index += 1;
      }
      const content = contentLines.length > 0 ? `${contentLines.join('\n')}\n` : '';
      operations.push({ type: 'add', path: filePath, content });
      continue;
    }

    if (line.startsWith(DELETE_PREFIX)) {
      const filePath = requirePatchPath(line.slice(DELETE_PREFIX.length), 'delete');
      operations.push({ type: 'delete', path: filePath });
      index += 1;
      continue;
    }

    throw patchError(`unexpected patch line: ${line}`);
  }

  if (!ended) throw patchError(`patch must end with ${END_PATCH}`);
  if (index !== lines.length) throw patchError('patch contains content after End Patch');
  if (operations.length === 0) throw patchError('patch must contain at least one file operation');
  return { operations };
}

function lineAlignedMatches(content, needle, eol) {
  const matches = [];
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(needle, from);
    if (index === -1) break;
    const end = index + needle.length;
    const startsOnBoundary = index === 0 || content[index - 1] === '\n';
    const endsOnBoundary = end === content.length || content.startsWith(eol, end);
    if (startsOnBoundary && endsOnBoundary) matches.push(index);
    from = index + 1;
  }
  return matches;
}

function hunkText(hunk, kind, eol) {
  return hunk.lines
    .filter(line => kind === 'old' ? line.kind !== 'add' : line.kind !== 'delete')
    .map(line => line.text)
    .join(eol);
}

export function applyUpdateHunks(originalText, hunks) {
  if (typeof originalText !== 'string') throw patchError('original update content must be text');
  if (!Array.isArray(hunks)) throw patchError('update hunks must be an array');
  const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
  let content = originalText;

  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks[index];
    const oldText = hunkText(hunk, 'old', eol);
    const newText = hunkText(hunk, 'new', eol);
    if (oldText.length === 0) throw patchError(`update hunk ${index + 1} has no exact anchor text`);
    const matches = lineAlignedMatches(content, oldText, eol);
    if (matches.length === 0) {
      throw patchError(`update hunk ${index + 1} exact context was not found; context mismatch`);
    }
    if (matches.length > 1) {
      throw patchError(`update hunk ${index + 1} exact context is ambiguous (${matches.length} matches)`);
    }

    let start = matches[0];
    let end = start + oldText.length;
    if (newText.length === 0) {
      if (content.startsWith(eol, end)) {
        end += eol.length;
      } else if (start >= eol.length && content.slice(start - eol.length, start) === eol) {
        start -= eol.length;
      }
    }
    content = `${content.slice(0, start)}${newText}${content.slice(end)}`;
  }

  return content;
}

function decodeUtf8(buffer, label) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) {
    throw patchError(`${label} is not valid UTF-8 text`);
  }
  return text;
}

function logicalLineCount(text) {
  if (text.length === 0) return 0;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts = normalized.split('\n');
  return parts.length - (parts.at(-1) === '' ? 1 : 0);
}

function hunkCounts(hunks) {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add') additions += 1;
      else if (line.kind === 'delete') deletions += 1;
    }
  }
  return { additions, deletions };
}

async function requireRegularFile(target, label) {
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw patchError(`${label} must resolve to a file`);
  return stat;
}

async function requireDestinationAbsent(target, label) {
  try {
    await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw patchError(`${label} already exists`, 'PATCH_CONFLICT');
}

async function requireExistingParent(target, label) {
  const parent = path.dirname(target);
  let stat;
  try {
    stat = await fs.stat(parent);
  } catch (error) {
    if (error?.code === 'ENOENT') throw patchError(`${label} parent must already exist`);
    throw error;
  }
  if (!stat.isDirectory()) throw patchError(`${label} parent must be a directory`);
}

function claimPath(claimed, target, label) {
  if (claimed.has(target)) {
    throw patchError(`${label} conflicts with another patch operation targeting ${target}`);
  }
  claimed.add(target);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
    throw patchError('patch cancelled', 'PATCH_CANCELLED');
  }
}

export async function preflightPatch({ pathMode = 'user', defaultCwd, patch: patchText, cwd, signal }) {
  if (pathMode !== 'user') {
    throw patchError('apply_patch is available only in personal user path mode');
  }

  const parsed = parsePatch(patchText);
  const baseCwd = await resolveUserCwd(defaultCwd, cwd);
  const claimed = new Set();
  const plan = [];

  for (const operation of parsed.operations) {
    throwIfAborted(signal);

    if (operation.type === 'add') {
      const target = await resolveUserPath(baseCwd, operation.path, { mustExist: false });
      claimPath(claimed, target, `add ${operation.path}`);
      await requireExistingParent(target, `add ${operation.path}`);
      await requireDestinationAbsent(target, `add ${operation.path}`);
      const after = Buffer.from(operation.content, 'utf8');
      plan.push({
        kind: 'add',
        path: operation.path,
        target,
        after,
        additions: logicalLineCount(operation.content),
        deletions: 0
      });
      continue;
    }

    const source = await resolveUserPath(baseCwd, operation.path);
    claimPath(claimed, source, `${operation.type} ${operation.path}`);
    const stat = await requireRegularFile(source, `${operation.type} ${operation.path}`);
    const before = await fs.readFile(source);

    if (operation.type === 'delete') {
      plan.push({
        kind: 'delete',
        path: operation.path,
        target: source,
        before: Buffer.from(before),
        additions: 0,
        deletions: logicalLineCount(decodeUtf8(before, `delete ${operation.path}`))
      });
      continue;
    }

    const originalText = decodeUtf8(before, `update ${operation.path}`);
    const afterText = applyUpdateHunks(originalText, operation.hunks);
    const after = Buffer.from(afterText, 'utf8');
    const counts = hunkCounts(operation.hunks);

    if (operation.moveTo !== null) {
      const destination = await resolveUserPath(baseCwd, operation.moveTo, { mustExist: false });
      claimPath(claimed, destination, `move destination ${operation.moveTo}`);
      await requireExistingParent(destination, `move destination ${operation.moveTo}`);
      await requireDestinationAbsent(destination, `move destination ${operation.moveTo}`);
      plan.push({
        kind: 'move',
        path: operation.path,
        target: source,
        moveTo: operation.moveTo,
        destination,
        before: Buffer.from(before),
        after,
        mode: stat.mode & 0o777,
        ...counts
      });
      continue;
    }

    plan.push({
      kind: 'update',
      path: operation.path,
      target: source,
      before: Buffer.from(before),
      after,
      ...counts
    });
  }

  return { baseCwd, operations: plan, signal };
}

const defaultOperations = {
  readFile: (...args) => fs.readFile(...args),
  writeFile: (...args) => fs.writeFile(...args),
  unlink: (...args) => fs.unlink(...args),
  lstat: (...args) => fs.lstat(...args)
};

async function assertSnapshot(operations, item) {
  let current;
  try {
    current = await operations.readFile(item.target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw patchError(`${item.kind} ${item.path} changed since preflight: source disappeared`, 'PATCH_CONFLICT');
    }
    throw error;
  }
  if (!Buffer.from(current).equals(item.before)) {
    throw patchError(`${item.kind} ${item.path} changed since preflight; reread and reconcile`, 'PATCH_CONFLICT');
  }
}

async function assertDestinationStillAbsent(operations, target, label) {
  try {
    await operations.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw patchError(`${label} destination already exists; patch conflict`, 'PATCH_CONFLICT');
}

function operationLabel(item) {
  if (item.kind === 'move') return `move ${item.path} -> ${item.moveTo}`;
  return `${item.kind} ${item.path}`;
}

function partialApplicationError(applied, failed, cause, extraApplied = [], uncertain = []) {
  const confirmed = [...applied, ...extraApplied];
  const appliedText = confirmed.length > 0 ? confirmed.join('; ') : 'none confirmed';
  const uncertainText = uncertain.length > 0 ? `; uncertain: ${uncertain.join('; ')}` : '';
  const message = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(`patch partially applied; applied: ${appliedText}${uncertainText}; failed: ${failed}: ${message}`);
  error.code = 'PATCH_PARTIAL';
  return error;
}

export async function applyPatchPlan(plan, operationOverrides = {}) {
  const operations = { ...defaultOperations, ...operationOverrides };
  const applied = [];
  const changes = [];

  for (const item of plan.operations) {
    const label = operationLabel(item);
    let extraApplied = [];
    try {
      throwIfAborted(plan.signal);

      const mutationTargets = item.kind === 'move'
        ? [item.target, item.destination]
        : [item.target];

      await withMutationPaths(mutationTargets, async () => {
        if (item.kind === 'add') {
          try {
            await operations.writeFile(item.target, item.after, { flag: 'wx' });
          } catch (error) {
            if (error?.code === 'EEXIST') {
              throw patchError(`add ${item.path} already exists; patch conflict`, 'PATCH_CONFLICT');
            }
            error.patchStateUnknown = true;
            throw error;
          }
        } else if (item.kind === 'update') {
          await assertSnapshot(operations, item);
          try {
            await operations.writeFile(item.target, item.after);
          } catch (error) {
            error.patchStateUnknown = true;
            throw error;
          }
        } else if (item.kind === 'delete') {
          await assertSnapshot(operations, item);
          await operations.unlink(item.target);
        } else if (item.kind === 'move') {
          await assertDestinationStillAbsent(operations, item.destination, `move ${item.path} -> ${item.moveTo}`);
          await assertSnapshot(operations, item);
          try {
            await operations.writeFile(item.destination, item.after, { flag: 'wx', mode: item.mode });
          } catch (error) {
            if (error?.code === 'EEXIST') {
              throw patchError(`move destination ${item.moveTo} already exists; patch conflict`, 'PATCH_CONFLICT');
            }
            error.patchStateUnknown = true;
            throw error;
          }
          extraApplied = [`created move destination ${item.moveTo} from ${item.path}; source retained until removal`];
          await assertSnapshot(operations, item);
          await operations.unlink(item.target);
          extraApplied = [];
        } else {
          throw patchError(`unknown preflight operation: ${item.kind}`);
        }
      });

      applied.push(label);
      changes.push({
        kind: item.kind,
        path: item.path,
        ...(item.kind === 'move' ? { moveTo: item.moveTo } : {}),
        additions: item.additions,
        deletions: item.deletions
      });
    } catch (error) {
      const mutationMayHaveStarted = applied.length > 0 || extraApplied.length > 0 || error?.patchStateUnknown;
      if (mutationMayHaveStarted) {
        const uncertain = error?.patchStateUnknown ? [`${label} write state unknown; reread target before retrying`] : [];
        throw partialApplicationError(applied, label, error, extraApplied, uncertain);
      }
      throw error;
    }
  }

  return { changes };
}

export async function runPatch(args, signal) {
  const plan = await preflightPatch({ ...args, signal });
  return applyPatchPlan(plan);
}
