import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BROWSER_FAST_CONFIG_FILE = path.join(
  os.homedir(),
  '.config',
  'mcp-dev-bridge',
  'browser-fast.json'
);
const MAX_CONFIG_BYTES = 16 * 1024;

function configError(code, message, cause) {
  const error = new Error(`${code}: ${message}`, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, location) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) {
    throw configError('BROWSER_FAST_CONFIG_INVALID', `${location} contains unknown key: ${unknown[0]}`);
  }
}

export async function resolveLinuxBrowserBackend({
  configFile = DEFAULT_BROWSER_FAST_CONFIG_FILE,
  readFile = fs.readFile,
  lstat = fs.lstat
} = {}) {
  let stat;
  try {
    stat = await lstat(configFile);
  } catch (error) {
    if (error?.code === 'ENOENT') return { browser: 'chrome', session: 'mcp-browser-fast-linux' };
    throw configError('BROWSER_FAST_CONFIG_UNAVAILABLE', `could not inspect ${configFile}`, error);
  }
  if (!stat.isFile()) throw configError('BROWSER_FAST_CONFIG_INVALID', `${configFile} must be a regular file`);
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw configError('BROWSER_FAST_CONFIG_INVALID', `${configFile} must be owned by the current user`);
  }
  if (stat.size > MAX_CONFIG_BYTES) {
    throw configError('BROWSER_FAST_CONFIG_INVALID', `${configFile} exceeds the ${MAX_CONFIG_BYTES}-byte limit`);
  }

  let text;
  try {
    text = await readFile(configFile, 'utf8');
  } catch (error) {
    throw configError('BROWSER_FAST_CONFIG_UNAVAILABLE', `could not read ${configFile}`, error);
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw configError('BROWSER_FAST_CONFIG_INVALID', `${configFile} is not valid JSON`, error);
  }
  if (!isRecord(config)) throw configError('BROWSER_FAST_CONFIG_INVALID', `${configFile} must contain a JSON object`);
  rejectUnknownKeys(config, new Set(['version', 'linux']), 'browser-fast config');
  if (config.version !== 1) throw configError('BROWSER_FAST_CONFIG_INVALID', 'browser-fast config version must be 1');
  if (!isRecord(config.linux)) throw configError('BROWSER_FAST_CONFIG_INVALID', 'browser-fast config linux must be an object');
  rejectUnknownKeys(config.linux, new Set(['browser', 'cdpPort']), 'browser-fast config linux');

  const browser = config.linux.browser;
  if (browser === 'firefox') {
    throw configError(
      'UNSUPPORTED_BROWSER_BACKEND',
      'Firefox does not expose Chromium CDP and Agent Browser 0.35.0 cannot drive it; use chrome or clearcote'
    );
  }
  if (browser === 'chrome') return { browser, session: 'mcp-browser-fast-linux' };
  if (browser !== 'clearcote') {
    throw configError('BROWSER_FAST_CONFIG_INVALID', 'browser-fast config linux.browser must be chrome, clearcote, or firefox');
  }

  const cdpPort = config.linux.cdpPort;
  if (!Number.isInteger(cdpPort) || cdpPort < 1 || cdpPort > 65535) {
    throw configError('BROWSER_FAST_CONFIG_INVALID', 'clearcote requires linux.cdpPort to be an integer from 1 to 65535');
  }
  return {
    browser,
    cdp: String(cdpPort),
    session: `mcp-browser-fast-linux-clearcote-${cdpPort}`
  };
}
