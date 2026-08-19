import { createServer } from 'node:http';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { PersistentOAuthProvider } from './oauth.mjs';
import { listMcpTools } from './mcp-client.mjs';

const action = process.argv[2] || 'status';
const mcpUrl = process.env.WEBSESSION_ADAPTER_MCP_URL;
const stateDir = process.env.WEBSESSION_ADAPTER_STATE_DIR;
const callbackUrl = process.env.WEBSESSION_ADAPTER_OAUTH_CALLBACK_URL || 'http://127.0.0.1:3052/callback';
if (!mcpUrl) throw new Error('WEBSESSION_ADAPTER_MCP_URL is required');
if (!stateDir) throw new Error('WEBSESSION_ADAPTER_STATE_DIR is required');

function normalizedUrl(value) {
  return new URL(value).href;
}

function callbackListener(url, provider) {
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('OAuth callback URL must use loopback HTTP');
  }

  let resolveCallback;
  let rejectCallback;
  const callback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', url);
      if (requestUrl.pathname !== url.pathname) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found\n');
        return;
      }

      const oauthError = requestUrl.searchParams.get('error');
      if (oauthError) throw new Error(`OAuth authorization failed: ${oauthError}`);

      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      const expectedState = provider.expectedState();
      if (!code) throw new Error('OAuth callback did not include an authorization code');
      if (!state || !expectedState || state !== expectedState) throw new Error('OAuth callback state mismatch');

      const callbackIssuer = requestUrl.searchParams.get('iss');
      const expectedIssuer = provider.expectedIssuer();
      if (callbackIssuer && expectedIssuer && normalizedUrl(callbackIssuer) !== normalizedUrl(expectedIssuer)) {
        throw new Error('OAuth callback issuer mismatch');
      }

      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('WebSession adapter authorization received. You may close this window.\n');
      resolveCallback({ code });
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('WebSession adapter authorization failed. Return to the terminal.\n');
      rejectCallback(error);
    }
  });

  return {
    callback,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(Number(url.port), url.hostname, resolve);
      });
    },
    async close() {
      if (!server.listening) return;
      await new Promise(resolve => server.close(resolve));
    },
  };
}

async function showStatus() {
  const provider = new PersistentOAuthProvider({ stateDir, redirectUrl: callbackUrl, onRedirect: () => {} });
  const tokens = provider.tokens();
  if (!tokens?.access_token) throw new Error('adapter OAuth is not authorized; run bin/adapter auth');
  const tools = await listMcpTools({ mcpUrl, stateDir, callbackUrl });
  process.stdout.write(`WebSession adapter OAuth: authorized\nOAuth scopes: ${tokens.scope || ''}\nMCP tools: ${tools.tools.length}\n`);
}

async function authorize() {
  const callback = new URL(callbackUrl);
  let authorizationUrl;
  const provider = new PersistentOAuthProvider({
    stateDir,
    redirectUrl: callbackUrl,
    onRedirect: url => {
      authorizationUrl = url;
    },
  });
  const listener = callbackListener(callback, provider);
  await listener.listen();

  try {
    const result = await auth(provider, { serverUrl: mcpUrl });
    if (result === 'REDIRECT') {
      if (!authorizationUrl) throw new Error('OAuth SDK did not provide an authorization URL');
      process.stdout.write('Open this URL in your browser to authorize the WebSession adapter:\n');
      process.stdout.write(`${authorizationUrl}\n`);
      const { code } = await listener.callback;
      const finished = await auth(provider, { serverUrl: mcpUrl, authorizationCode: code });
      if (finished !== 'AUTHORIZED') throw new Error('OAuth token exchange did not complete');
    }
  } finally {
    await listener.close();
  }

  await showStatus();
}

if (action === 'auth') await authorize();
else if (action === 'status') await showStatus();
else throw new Error('usage: node auth.mjs auth|status');
