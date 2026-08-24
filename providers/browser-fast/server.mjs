import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ensureWindowsChrome } from '../browser/windows-chrome-runtime.mjs';

export const AGENT_BROWSER_VERSION = '0.34.0';
export const DEFAULT_SESSION_PREFIX = 'mcp-browser-fast';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_BROWSER_JS = path.join(DIR, 'node_modules', 'agent-browser', 'bin', 'agent-browser.js');
const WINDOWS_AGENT_BROWSER_SOURCE = path.join(DIR, 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe');
const WINDOWS_RUNNER_SOURCE = path.join(DIR, 'windows-runner.cjs');
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const AGENT_BROWSER_MAX_OUTPUT_CHARS = 262144;

function fastError(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw fastError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  return value;
}

function targetName(value) {
  const target = value ?? 'windows';
  if (target !== 'windows' && target !== 'linux') throw fastError('INVALID_BROWSER_TARGET', `expected windows or linux, got ${String(target)}`);
  return target;
}

function withoutLifecycle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { lifecycle: _lifecycle, ...rest } = value;
  return rest;
}

function jsonResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function errorResult(error) {
  const code = typeof error?.code === 'string' ? error.code : 'BROWSER_FAST_FAILED';
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.startsWith(`${code}: `) ? raw.slice(code.length + 2) : raw;
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } }
  };
}

async function runProcess(command, args, { cwd, env, input, acceptNonZero = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const overflow = stream => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(fastError('BROWSER_FAST_OUTPUT_LIMIT', `${stream} exceeded ${MAX_OUTPUT_BYTES} bytes`));
    };

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) return overflow('stdout');
      stdout.push(chunk);
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT_BYTES) return overflow('stderr');
      stderr.push(chunk);
    });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      reject(fastError('BROWSER_FAST_PROCESS_FAILED', `failed to start ${command}`, error));
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      const result = {
        code: code ?? -1,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim()
      };
      if (result.code !== 0 && !acceptNonZero) {
        reject(fastError('BROWSER_FAST_COMMAND_FAILED', result.stderr || result.stdout || `${command} exited ${result.code}`));
        return;
      }
      resolve(result);
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

function parseAgentBrowserBatch(result) {
  let items;
  try {
    items = JSON.parse(result.stdout || '[]');
  } catch (error) {
    throw fastError('BROWSER_FAST_INVALID_OUTPUT', result.stderr || 'agent-browser batch returned invalid JSON', error);
  }
  if (!Array.isArray(items)) throw fastError('BROWSER_FAST_INVALID_OUTPUT', 'agent-browser batch did not return an array');
  if (result.code !== 0 && items.length === 0) {
    throw fastError('BROWSER_FAST_COMMAND_FAILED', result.stderr || 'agent-browser batch failed before producing a step result');
  }
  return { items, stderr: result.stderr, exitCode: result.code };
}

export class AgentBrowserRunner {
  constructor({
    env = process.env,
    processRunner = runProcess,
    windowsSource = WINDOWS_AGENT_BROWSER_SOURCE,
    windowsRunnerSource = WINDOWS_RUNNER_SOURCE,
    windowsChromeEnsure
  } = {}) {
    this.env = env;
    this.processRunner = processRunner;
    this.windowsSource = windowsSource;
    this.windowsRunnerSource = windowsRunnerSource;
    this.windowsChromeEnsure = windowsChromeEnsure ?? (() => ensureWindowsChrome({ processRunner: this.processRunner }));
    this.windowsAgentRuntimePromise = null;
    this.linuxUsed = false;
  }

  async windowsAgentRuntime(chrome) {
    if (!this.windowsAgentRuntimePromise) {
      this.windowsAgentRuntimePromise = (async () => {
        const runtimeDir = path.join(chrome.localAppData, 'mcp-dev-bridge', 'agent-browser', AGENT_BROWSER_VERSION);
        const windowsRuntimeDir = `${chrome.windowsLocalAppData}\\mcp-dev-bridge\\agent-browser\\${AGENT_BROWSER_VERSION}`;
        const executable = path.join(runtimeDir, 'agent-browser.exe');
        const helper = path.join(runtimeDir, 'windows-runner.cjs');
        const sourceStat = await fs.stat(this.windowsSource);
        let install = false;
        try {
          install = (await fs.stat(executable)).size !== sourceStat.size;
        } catch {
          install = true;
        }
        await fs.mkdir(runtimeDir, { recursive: true });
        if (install) await fs.copyFile(this.windowsSource, executable);
        await fs.copyFile(this.windowsRunnerSource, helper);
        return {
          executable,
          helper,
          nodeExecutable: chrome.nodeExecutable,
          windowsExecutable: `${windowsRuntimeDir}\\agent-browser.exe`,
          windowsHelper: `${windowsRuntimeDir}\\windows-runner.cjs`
        };
      })().catch(error => {
        this.windowsAgentRuntimePromise = null;
        throw error;
      });
    }
    return this.windowsAgentRuntimePromise;
  }

  async windowsRuntime() {
    const chrome = await this.windowsChromeEnsure();
    return { ...chrome, ...(await this.windowsAgentRuntime(chrome)) };
  }

  async runWindowsAgentBrowser(runtime, args, { input, acceptNonZero = false } = {}) {
    const wrapped = await this.processRunner(runtime.nodeExecutable, [
      runtime.windowsHelper,
      runtime.windowsExecutable,
      JSON.stringify(args),
      String(MAX_OUTPUT_BYTES)
    ], {
      cwd: '/mnt/c',
      input,
      acceptNonZero: true
    });
    let result;
    try {
      result = JSON.parse(wrapped.stdout || '{}');
    } catch (error) {
      throw fastError('WINDOWS_AGENT_BROWSER_HELPER_INVALID', wrapped.stderr || 'Windows Agent Browser helper returned invalid JSON', error);
    }
    if (wrapped.code !== 0 || result?.error) {
      throw fastError('WINDOWS_AGENT_BROWSER_HELPER_FAILED', result?.error || wrapped.stderr || `Windows Agent Browser helper exited ${wrapped.code}`);
    }
    const normalized = {
      code: Number.isInteger(result?.code) ? result.code : -1,
      signal: result?.signal ?? null,
      stdout: typeof result?.stdout === 'string' ? result.stdout : '',
      stderr: typeof result?.stderr === 'string' ? result.stderr : ''
    };
    if (normalized.code !== 0 && !acceptNonZero) {
      throw fastError('BROWSER_FAST_COMMAND_FAILED', normalized.stderr || normalized.stdout || `agent-browser exited ${normalized.code}`);
    }
    return normalized;
  }

  async windowsBatch(commands, { bail = true } = {}) {
    const runtime = await this.windowsRuntime();
    const args = [
      '--session', `${DEFAULT_SESSION_PREFIX}-windows`,
      '--cdp', runtime.wsEndpoint,
      '--pin-tab',
      '--idle-timeout', '0',
      '--max-output', String(AGENT_BROWSER_MAX_OUTPUT_CHARS),
      'batch'
    ];
    if (bail) args.push('--bail');
    args.push('--json');
    const result = await this.runWindowsAgentBrowser(runtime, args, {
      input: JSON.stringify(commands),
      acceptNonZero: true
    });
    return parseAgentBrowserBatch(result);
  }

  async linuxBatch(commands, { bail = true } = {}) {
    this.linuxUsed = true;
    const args = [
      AGENT_BROWSER_JS,
      '--session', `${DEFAULT_SESSION_PREFIX}-linux`,
      '--headed',
      '--pin-tab',
      '--idle-timeout', '1h',
      '--max-output', String(AGENT_BROWSER_MAX_OUTPUT_CHARS),
      'batch'
    ];
    if (bail) args.push('--bail');
    args.push('--json');
    const result = await this.processRunner(process.execPath, args, {
      env: { ...this.env, AGENT_BROWSER_NO_XVFB: '1' },
      input: JSON.stringify(commands),
      acceptNonZero: true
    });
    return parseAgentBrowserBatch(result);
  }

  async targetBatch(target, commands, options) {
    return target === 'windows'
      ? this.windowsBatch(commands, options)
      : this.linuxBatch(commands, options);
  }

  async batch(target, commands, { bail = true, tab } = {}) {
    if (tab !== undefined) {
      try {
        const requestedTab = requiredString(tab, 'tab');
        const listing = await this.targetBatch(target, [['tab', 'list']], { bail: true });
        const listed = listing.items[0];
        if (listed?.success !== true) {
          return { items: [], stderr: listing.stderr, exitCode: 1, contextError: listed?.error || 'failed to inspect current tab context' };
        }
        const tabs = listed.result?.tabs ?? [];
        const current = tabs.find(item => item.active === true) ?? tabs[0];
        const currentTab = current?.targetId ?? current?.tabId;
        if (!currentTab || currentTab !== requestedTab) {
          return {
            items: [],
            stderr: listing.stderr,
            exitCode: 1,
            contextError: `TAB_CONTEXT_MISMATCH: requested ${requestedTab}, current ${currentTab ?? 'none'}; observe the intended tab before executing`
          };
        }
      } catch (error) {
        return { items: [], stderr: '', exitCode: 1, contextError: error instanceof Error ? error.message : String(error) };
      }
    }
    try {
      return await this.targetBatch(target, commands, { bail });
    } catch (error) {
      if (target !== 'windows') throw error;
      const message = error instanceof Error ? error.message : String(error);
      return {
        items: commands.map(command => ({ command, success: false, uncertain: true, error: message })),
        stderr: '',
        exitCode: 1
      };
    }
  }

  async close() {
    if (!this.linuxUsed) return;
    this.linuxUsed = false;
    await this.processRunner(process.execPath, [
      AGENT_BROWSER_JS,
      '--session', `${DEFAULT_SESSION_PREFIX}-linux`,
      'close'
    ], {
      env: { ...this.env, AGENT_BROWSER_NO_XVFB: '1' },
      acceptNonZero: true
    }).catch(() => {});
  }
}

function snapshotCommand(scope, includeUrls) {
  const command = ['snapshot'];
  if (scope === 'interactive') command.push('-i');
  else if (scope === 'compact') command.push('-c', '-d', '6');
  else if (scope !== 'full') throw fastError('INVALID_ARGUMENT', `unknown observe scope: ${String(scope)}`);
  if (includeUrls) command.push('-u');
  return command;
}

function directTarget(action) {
  const target = requiredString(action.target, `${action.op}.target`);
  return target.startsWith('e') && /^e\d+$/.test(target) ? `@${target}` : target;
}

export function actionCommand(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw fastError('INVALID_ARGUMENT', 'each action must be an object');
  const op = requiredString(action.op, 'action.op');
  switch (op) {
    case 'navigate': return ['open', requiredString(action.url, 'navigate.url')];
    case 'back': return ['back'];
    case 'forward': return ['forward'];
    case 'reload': return ['reload'];
    case 'click': return ['click', directTarget(action)];
    case 'fill': return ['fill', directTarget(action), requiredString(action.value, 'fill.value')];
    case 'type': return ['type', directTarget(action), requiredString(action.value, 'type.value')];
    case 'check': return ['check', directTarget(action)];
    case 'uncheck': return ['uncheck', directTarget(action)];
    case 'select': {
      if (!Array.isArray(action.values) || action.values.length !== 1 || typeof action.values[0] !== 'string') {
        throw fastError('INVALID_ARGUMENT', 'select.values must contain exactly one string');
      }
      return ['select', directTarget(action), action.values[0]];
    }
    case 'press': return ['press', requiredString(action.key, 'press.key')];
    case 'wait': {
      const modes = [action.text !== undefined, action.milliseconds !== undefined].filter(Boolean).length;
      if (modes !== 1) throw fastError('INVALID_ARGUMENT', 'wait requires exactly one of text or milliseconds');
      if (action.text !== undefined) return ['wait', '--text', requiredString(action.text, 'wait.text')];
      if (!Number.isInteger(action.milliseconds) || action.milliseconds < 0) throw fastError('INVALID_ARGUMENT', 'wait.milliseconds must be a non-negative integer');
      return ['wait', String(action.milliseconds)];
    }
    case 'tab_list': return ['tab', 'list'];
    case 'tab_new': return action.url === undefined ? ['tab', 'new'] : ['tab', 'new', requiredString(action.url, 'tab_new.url')];
    case 'tab_switch': return ['tab', requiredString(action.tab, 'tab_switch.tab')];
    case 'tab_close': return action.tab === undefined ? ['tab', 'close'] : ['tab', 'close', requiredString(action.tab, 'tab_close.tab')];
    default: throw fastError('INVALID_ARGUMENT', `unsupported action op: ${op}`);
  }
}

export class FastBrowser {
  constructor({ runner = new AgentBrowserRunner() } = {}) {
    if (!runner || typeof runner.batch !== 'function') throw new TypeError('runner with batch() is required');
    this.runner = runner;
    this.operationTails = new Map();
  }

  async withTargetLock(target, operation) {
    const previous = this.operationTails.get(target) ?? Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    this.operationTails.set(target, tail);
    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.operationTails.get(target) === tail) this.operationTails.delete(target);
    }
  }

  async close() {
    if (typeof this.runner.close === 'function') await this.runner.close();
  }

  async listTabsUnlocked(target, options = {}) {
    const listed = await this.runner.batch(target, [['tab', 'list']], { bail: true, ...options });
    if (listed.contextError) return { error: listed.contextError };
    const item = listed.items[0];
    if (item?.success !== true) return { error: item?.error || 'tab list failed' };
    return { tabs: item.result?.tabs ?? [] };
  }

  async observeUnlocked(target, { scope = 'interactive', include_urls = true, tab } = {}) {
    let selectedTab = tab === undefined ? undefined : requiredString(tab, 'tab');
    if (selectedTab === undefined) {
      const listed = await this.listTabsUnlocked(target);
      if (listed.error) throw fastError('BROWSER_FAST_OBSERVE_FAILED', listed.error);
      const tabs = listed.tabs;
      const current = tabs.find(item => item.active === true) ?? tabs[0];
      selectedTab = current?.targetId ?? current?.tabId;
      if (!selectedTab) throw fastError('BROWSER_FAST_OBSERVE_FAILED', 'browser has no tab available');
    }
    const selected = await this.runner.batch(target, [['tab', selectedTab]], { bail: true });
    if (selected.contextError) throw fastError('BROWSER_FAST_OBSERVE_FAILED', selected.contextError);
    const selectedItem = selected.items[0];
    if (selectedItem?.success !== true) throw fastError('BROWSER_FAST_OBSERVE_FAILED', selectedItem?.error || `failed to select tab ${selectedTab}`);

    const commands = [snapshotCommand(scope, include_urls), ['tab', 'list']];
    const batch = await this.runner.batch(target, commands, { bail: true });
    if (batch.contextError) throw fastError('BROWSER_FAST_OBSERVE_FAILED', batch.contextError);
    const { items } = batch;
    if (items.some(item => item?.success !== true)) {
      const failed = items.find(item => item?.success !== true);
      throw fastError('BROWSER_FAST_OBSERVE_FAILED', failed?.error || 'observe command failed');
    }
    const snapshotItem = items[0]?.result ?? {};
    const tabItem = items[1]?.result ?? {};
    const tabs = (tabItem.tabs ?? []).map(item => ({
      tab_id: item.targetId ?? item.tabId,
      target_id: item.targetId,
      active: item.active === true,
      title: item.title,
      url: item.url
    }));
    return {
      browser_target: target,
      active_tab: tabs.find(item => item.active)?.tab_id ?? null,
      origin: snapshotItem.origin ?? tabs.find(item => item.active)?.url ?? null,
      snapshot: snapshotItem.snapshot ?? '',
      refs: snapshotItem.refs ?? {},
      tabs
    };
  }

  async observe({ browser_target, scope = 'interactive', include_urls = true, tab } = {}) {
    const target = targetName(browser_target);
    return this.withTargetLock(target, () => this.observeUnlocked(target, { scope, include_urls, tab }));
  }

  async execute({ browser_target, actions, stop_on_error = true, final_state = 'interactive', tab } = {}) {
    const target = targetName(browser_target);
    const requestedTab = requiredString(tab, 'tab');
    if (!Array.isArray(actions) || actions.length === 0) throw fastError('INVALID_ARGUMENT', 'actions must be a non-empty array');
    const actionCommands = actions.map(actionCommand);

    return this.withTargetLock(target, async () => {
      const initial = await this.listTabsUnlocked(target, { tab: requestedTab });
      if (initial.error) {
        return {
          browser_target: target,
          outcome: 'failed',
          context_error: initial.error,
          steps: actions.map((action, index) => ({ index, op: action.op, status: 'not_run' }))
        };
      }

      const items = new Array(actions.length);
      let transitionError;
      let index = 0;

      while (index < actionCommands.length && !transitionError) {
        const relativeClick = actionCommands.slice(index).findIndex(command => command[0] === 'click');
        const clickIndex = relativeClick === -1 ? actionCommands.length : index + relativeClick;

        if (clickIndex > index) {
          const batch = await this.runner.batch(target, actionCommands.slice(index, clickIndex), {
            bail: stop_on_error !== false
          });
          if (batch.contextError) {
            transitionError = batch.contextError;
            break;
          }
          for (let itemIndex = 0; itemIndex < clickIndex - index; itemIndex += 1) {
            items[index + itemIndex] = batch.items[itemIndex];
          }
          if (stop_on_error !== false && batch.items.some(item => item?.success !== true)) break;
          index = clickIndex;
        }

        if (index >= actionCommands.length) break;

        const before = index === 0 ? initial : await this.listTabsUnlocked(target);
        if (before.error) {
          transitionError = `failed to inspect tabs before click: ${before.error}`;
          break;
        }
        const beforeIds = new Set(before.tabs.map(item => item.targetId ?? item.tabId).filter(Boolean));
        const click = await this.runner.batch(target, [actionCommands[index]], { bail: true });
        if (click.contextError) {
          transitionError = click.contextError;
          break;
        }
        const clickItem = click.items[0];
        items[index] = clickItem;
        index += 1;

        if (clickItem?.success === true || clickItem?.uncertain === true) {
          const after = await this.listTabsUnlocked(target);
          if (after.error) {
            transitionError = `click completed but new-tab detection failed: ${after.error}`;
            break;
          }
          const newTabs = after.tabs.filter(item => {
            const id = item.targetId ?? item.tabId;
            return id && !beforeIds.has(id);
          });
          if (newTabs.length > 1) {
            transitionError = `click opened multiple new tabs (${newTabs.length}); refusing to choose one`;
            break;
          }
          if (newTabs.length === 1) {
            const newTab = newTabs[0].targetId ?? newTabs[0].tabId;
            const selected = await this.runner.batch(target, [['tab', newTab]], { bail: true });
            const selectedItem = selected.items[0];
            if (selected.contextError || selectedItem?.success !== true) {
              transitionError = `click opened tab ${newTab}, but binding it failed: ${selected.contextError || selectedItem?.error || 'tab selection failed'}`;
              break;
            }
          }
        }

        if (stop_on_error !== false && clickItem?.success !== true) break;
      }

      const steps = actions.map((action, index) => {
        const item = items[index];
        if (!item) return { index, op: action.op, status: 'not_run' };
        if (item.success === true) return { index, op: action.op, status: 'completed', result: withoutLifecycle(item.result) };
        if (item.uncertain === true) return { index, op: action.op, status: 'unknown', error: item.error || 'action outcome is uncertain' };
        return { index, op: action.op, status: 'failed', error: item.error || 'browser action failed' };
      });
      const failedAt = steps.find(step => step.status === 'failed' || step.status === 'unknown')?.index;
      const completedCount = steps.filter(step => step.status === 'completed').length;
      const hasUnknown = steps.some(step => step.status === 'unknown');
      const outcome = hasUnknown
        ? completedCount > 0 ? 'partial' : 'unknown'
        : completedCount === 0 && (failedAt !== undefined || transitionError)
          ? 'failed'
          : failedAt !== undefined || transitionError || steps.some(step => step.status === 'not_run')
            ? 'partial'
            : 'completed';

      let finalState;
      let finalStateError;
      if (final_state !== 'none') {
        try {
          if (!['interactive', 'compact', 'full'].includes(final_state)) throw fastError('INVALID_ARGUMENT', `unknown final_state: ${String(final_state)}`);
          finalState = await this.observeUnlocked(target, {
            scope: final_state,
            include_urls: true
          });
        } catch (error) {
          finalStateError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        browser_target: target,
        outcome,
        failed_at: failedAt,
        transition_error: transitionError,
        steps,
        final_state: finalState,
        final_state_error: finalStateError
      };
    });
  }
}

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['navigate', 'back', 'forward', 'reload', 'click', 'fill', 'type', 'check', 'uncheck', 'select', 'press', 'wait', 'tab_list', 'tab_new', 'tab_switch', 'tab_close']
    },
    target: { type: 'string', minLength: 1, description: 'Opaque element ref/uid from the latest observe result. Do not invent CSS/XPath selectors.' },
    value: { type: 'string' },
    values: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 },
    key: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 1 },
    url: { type: 'string', minLength: 1 },
    milliseconds: { type: 'integer', minimum: 0 },
    tab: { type: 'string', minLength: 1 }
  },
  required: ['op'],
  additionalProperties: false
};

export function createBrowserFastServer({ browser } = {}) {
  if (!browser || typeof browser.observe !== 'function' || typeof browser.execute !== 'function') {
    throw new TypeError('browser with observe() and execute() is required');
  }
  const server = new Server(
    { name: 'browser-fast', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: 'Fast resource-local browser interaction. Observe once for stable refs/tabs, execute mechanical sequences locally, and never assume failed or partial batches are safe to replay.'
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    {
      name: 'observe',
      description: 'Return compact interactive browser state with stable tab IDs and element refs. Prefer this before interaction instead of repeated screenshots or full-page dumps.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          browser_target: { type: 'string', enum: ['windows', 'linux'], description: 'Omit for the dedicated persistent Windows MCP Chrome profile; use linux for the managed WSLg Agent Browser session.' },
          scope: { type: 'string', enum: ['interactive', 'compact', 'full'], default: 'interactive' },
          include_urls: { type: 'boolean', default: true },
          tab: { type: 'string', minLength: 1, description: 'Optional stable tab ID or CDP target ID to select before observing.' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'execute',
      description: 'Execute multiple mechanical browser actions locally in one call. After a click, exactly one new tab is followed before later actions; multiple new tabs stop the sequence without guessing. Defaults to fail-fast, never auto-retries, and reports completed/failed/unknown/not-run steps plus final compact state so partial external side effects are explicit.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          browser_target: { type: 'string', enum: ['windows', 'linux'], description: 'Omit for the dedicated persistent Windows MCP Chrome profile; use linux for the managed WSLg Agent Browser session.' },
          tab: { type: 'string', minLength: 1, description: 'Required tab ID from the latest observe result. Execution validates that the pinned Agent Browser session is still on this exact tab and fails closed on mismatch; it does not switch tabs.' },
          actions: { type: 'array', items: ACTION_SCHEMA, minItems: 1, maxItems: 64 },
          stop_on_error: { type: 'boolean', default: true, description: 'Stop at the first failed action. The executor never retries actions automatically.' },
          final_state: { type: 'string', enum: ['none', 'interactive', 'compact', 'full'], default: 'interactive' }
        },
        required: ['tab', 'actions'],
        additionalProperties: false
      }
    }
  ] }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      if (request.params.name === 'observe') return jsonResult(await browser.observe(request.params.arguments ?? {}));
      if (request.params.name === 'execute') return jsonResult(await browser.execute(request.params.arguments ?? {}));
      return errorResult(fastError('UNKNOWN_BROWSER_FAST_TOOL', `unknown tool: ${request.params.name}`));
    } catch (error) {
      return errorResult(error);
    }
  });
  return server;
}

export async function runBrowserFastStdio() {
  const browser = new FastBrowser();
  const server = createBrowserFastServer({ browser });
  const transport = new StdioServerTransport();
  let shutdownPromise = null;
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      await browser.close();
      await server.close();
    })();
    return shutdownPromise;
  };

  await server.connect(transport);
  const serverClose = transport.onclose;
  transport.onclose = () => {
    serverClose?.();
    void shutdown();
  };

  return { browser, server, transport, shutdown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = await runBrowserFastStdio();
  process.stdin.once('end', () => { void runtime.shutdown(); });
  const shutdownAndExit = () => {
    void runtime.shutdown().then(
      () => process.exit(0),
      error => {
        process.stderr.write(`Browser Fast shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    );
  };
  process.once('SIGTERM', shutdownAndExit);
  process.once('SIGINT', shutdownAndExit);
}
