import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { canonicalDefaultCwd, canonicalWorkspaceRoot } from './boundary.mjs';
import { runRead, runEdit, runWrite } from './files.mjs';
import { runPatch } from './patch.mjs';
import { runBash } from './shell.mjs';
import { renderBashText, renderEditPartial, renderEditText, renderPatchText, renderWriteText } from './render.mjs';
import { WaitEngine } from './wait-engine.mjs';
import { LocalWaitSources } from './wait-local.mjs';
import { waitInputSchema } from './wait-schema.mjs';
import { WaitStore } from './wait-state.mjs';
import { TerminalWaitSource } from './wait-terminal.mjs';

const mode = process.env.MCP_DEV_SHELL_MODE;
if (!['allowlist', 'unrestricted'].includes(mode)) {
  console.error('MCP_DEV_SHELL_MODE must be allowlist or unrestricted');
  process.exit(2);
}

const pathMode = process.env.MCP_DEV_PATH_MODE ?? 'workspace';
if (!['workspace', 'user'].includes(pathMode)) {
  console.error('MCP_DEV_PATH_MODE must be workspace or user');
  process.exit(2);
}

let workspaceRoot = null;
let defaultCwd = null;
try {
  if (pathMode === 'workspace') workspaceRoot = await canonicalWorkspaceRoot(process.env.MCP_DEV_WORKSPACE_ROOT);
  else defaultCwd = await canonicalDefaultCwd(process.env.MCP_DEV_DEFAULT_CWD);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const stateDir = process.env.MCP_DEV_STATE_DIR;
if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) {
  console.error('MCP_DEV_STATE_DIR must be an absolute path');
  process.exit(2);
}

const maxOutputBytes = Number(process.env.MCP_DEV_MAX_OUTPUT_BYTES ?? '1048576');
if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > 16 * 1024 * 1024) {
  console.error('MCP_DEV_MAX_OUTPUT_BYTES must be an integer from 1 to 16777216');
  process.exit(2);
}

let waitEngine = null;
if (pathMode === 'user') {
  const terminalSocketPath = process.env.MCP_DEV_TERMINAL_SOCKET;
  if (typeof terminalSocketPath !== 'string' || !path.isAbsolute(terminalSocketPath)) {
    console.error('MCP_DEV_TERMINAL_SOCKET must be an absolute path in user mode');
    process.exit(2);
  }
  const { BrokerClient } = await import('../terminal/broker-client.mjs');
  const terminalSource = new TerminalWaitSource({ client: new BrokerClient({ socketPath: terminalSocketPath }) });
  const localSource = new LocalWaitSources({ defaultCwd });
  waitEngine = new WaitEngine({
    store: new WaitStore({ stateDir }),
    sources: {
      terminal_output: terminalSource,
      terminal_exit: terminalSource,
      process_exit: localSource,
      tcp_listen: localSource,
      file_exists: localSource,
      file_changed: localSource,
      http_ready: localSource,
      systemd_user: localSource,
    },
  });
}

const server = new McpServer({ name: 'pi-dev', version: '0.1.0' });
const modelPath = pathMode === 'user'
  ? z.string().min(1).describe('Path; relative paths resolve from the configured default cwd and absolute paths are accepted')
  : z.string().min(1).describe('Path relative to the configured workspace root');
const cwdPath = pathMode === 'user'
  ? z.string().min(1).describe('Optional cwd; relative paths resolve from the configured default cwd and absolute paths are accepted')
  : z.string().min(1).describe('Optional cwd relative to the configured workspace root');
const pathPolicy = { pathMode, workspaceRoot, defaultCwd };

async function invoke(fn) {
  try {
    return await fn();
  } catch (error) {
    const text = error?.code === 'EDIT_PARTIAL' && error?.editPartial
      ? renderEditPartial(error.editPartial)
      : (error instanceof Error ? error.message : String(error));
    return {
      isError: true,
      content: [{ type: 'text', text }]
    };
  }
}

async function invokeWait(fn) {
  try {
    return await fn();
  } catch (error) {
    const code = typeof error?.code === 'string' ? `${error.code}: ` : '';
    return {
      isError: true,
      content: [{ type: 'text', text: `${code}${error instanceof Error ? error.message : String(error)}` }],
    };
  }
}

function renderWaitResult(result) {
  if (result.status === 'pending') {
    return `pending ${result.name} deadline=${new Date(result.deadlineAtMs).toISOString()}`;
  }
  if (result.status === 'matched') {
    return `matched ${result.name}${result.evidence === undefined ? '' : ` ${String(result.evidence)}`}`;
  }
  if (result.status === 'timeout') return `timeout ${result.name}`;
  if (result.status === 'cancelled') return `cancelled ${result.name}`;
  return `${result.code ?? 'WAIT_FAILED'}: ${result.name}${result.evidence === undefined ? '' : ` ${String(result.evidence)}`}`;
}

server.registerTool('read', {
  description: pathMode === 'user'
    ? 'Read focused UTF-8/text available to the WSL user; prefer this over Bash cat/sed for ordinary bounded file reads. offset is a 1-based line number, limit is a line count, and large text is bounded/truncated with continuation guidance; this Dev wrapper is text-only. Relative paths use the configured default cwd and absolute paths are accepted'
    : 'Read focused UTF-8/text below the configured workspace root; prefer this over Bash cat/sed for ordinary bounded file reads. offset is a 1-based line number, limit is a line count, and large text is bounded/truncated with continuation guidance; this Dev wrapper is text-only',
  inputSchema: {
    path: modelPath,
    offset: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional()
  }
}, async (args, extra) => invoke(async () => {
  const result = await runRead({ ...pathPolicy, ...args }, extra.signal);
  if (result.content.some(block => block.type !== 'text')) {
    throw new Error('dev.read supports text files only');
  }
  return { content: result.content };
}));

server.registerTool('edit', {
  description: pathMode === 'user'
    ? 'Apply guarded exact, unique, disjoint replacements to one or more existing text files. Use edit when the exact old text is already known; use apply_patch for contextual/structural work, add/delete/move, or ambiguous anchors. Relative paths use the configured default cwd and absolute paths are accepted'
    : 'Apply guarded exact, unique, disjoint replacements to one or more existing text files below the workspace root. Use edit when the exact old text is already known; use apply_patch for contextual/structural work or ambiguous anchors',
  inputSchema: {
    targets: z.array(z.object({
      path: modelPath,
      edits: z.array(z.object({ oldText: z.string().min(1), newText: z.string() })).min(1)
    })).min(1)
  }
}, async (args, extra) => invoke(async () => {
  const result = await runEdit({ ...pathPolicy, ...args }, extra.signal);
  const text = result.targets.map(target => renderEditText(target.path, target.diff)).join('\n');
  return { content: [{ type: 'text', text }] };
}));

server.registerTool('write', {
  description: pathMode === 'user'
    ? 'Create-only: create a new WSL-user-accessible text file whose parent directory already exists; fails if the target exists. Use edit or apply_patch for existing files; relative paths use the configured default cwd and absolute paths are accepted'
    : 'Create-only: create a new text file below the workspace root whose parent directory already exists; fails if the target exists',
  inputSchema: { path: modelPath, content: z.string() }
}, async (args, extra) => invoke(async () => {
  await runWrite({ ...pathPolicy, ...args }, extra.signal);
  return { content: [{ type: 'text', text: renderWriteText(args.path) }] };
}));

if (pathMode === 'user') {
  server.registerTool('wait', {
    description: 'Create, resume, or cancel one durable named wait; prefer this over Bash polling/sleep loops. Supported conditions include Terminal output/exit, process exit, TCP listen, file exists/change, HTTP readiness, and user-systemd state. A condition arms the wait, a later name-only call resumes it, cancel=true cancels it, and hold_seconds bounds one invocation rather than the durable deadline. Terminal-output waits match only output produced after arming and do not consume the Terminal model cursor.',
    inputSchema: waitInputSchema,
  }, async (args, extra) => invokeWait(async () => {
    const result = await waitEngine.run(args, extra.signal);
    if (result.status === 'failed') {
      return {
        isError: true,
        content: [{ type: 'text', text: renderWaitResult(result) }],
      };
    }
    return { content: [{ type: 'text', text: renderWaitResult(result) }] };
  }));

  server.registerTool('apply_patch', {
    description: 'Apply one exact-context Codex-style patch for coordinated multi-file or structural text changes, including add/delete/move; exact context must uniquely identify the intended edit. All targets are preflighted before mutation, but a later runtime failure can report partial application.',
    inputSchema: {
      patch: z.string().min(1).describe('Patch text using *** Begin Patch, *** Update File:, optional *** Move to:, @@ hunks with space/-/+ lines, *** Add File:, *** Delete File:, and *** End Patch'),
      cwd: cwdPath.optional()
    }
  }, async (args, extra) => invoke(async () => {
    const result = await runPatch({ ...pathPolicy, ...args }, extra.signal);
    return { content: [{ type: 'text', text: renderPatchText(result) }] };
  }));
}

if (mode === 'unrestricted') {
  server.registerTool('bash', {
    description: pathMode === 'user'
      ? 'Run one bounded, noninteractive native Bash command as the WSL user; prefer for short commands, Git, builds, tests, rg, repository inspection, and ordinary execution. Default timeout is 30 seconds, maximum 300 seconds, and large output may be truncated with a full-output path. Use Terminal for processes that must persist or need a PTY/interactive workflow. For a large or unfamiliar repository, Bash with rg plus focused read is the lower-cost discovery path before potentially heavyweight CodeDB-backed Code tools. Do not use raw tmux or wsl-term through Bash to bypass human Terminal ownership. cwd defaults to the configured default cwd and may be relative to it or absolute'
      : 'Run one bounded, noninteractive native Bash command; prefer for short commands, Git, builds, tests, and ordinary execution. Default timeout is 30 seconds, maximum 300 seconds, and large output may be truncated with a full-output path; cwd is optional and workspace-relative',
    inputSchema: {
      command: z.string().min(1),
      cwd: cwdPath.optional(),
      timeout_seconds: z.number().positive().max(300).optional()
    }
  }, async (args, extra) => invoke(async () => {
    const result = await runBash({
      ...pathPolicy,
      ...args,
      maxOutputBytes,
      stateDir
    }, extra.signal);
    return { content: [{ type: 'text', text: renderBashText(result) }] };
  }));
}

await server.connect(new StdioServerTransport());
