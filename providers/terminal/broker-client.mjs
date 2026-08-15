import net from 'node:net';

import { TerminalError } from './protocol.mjs';

const DEFAULT_RETRY_WINDOW_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 25;
const DEFAULT_REQUEST_TIMEOUT_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableConnectionError(error) {
  return error?.retryable === true || ['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(error?.code);
}

function closedEarlyError() {
  const error = new Error('broker connection closed before a complete response');
  error.code = 'BROKER_CONNECTION_CLOSED';
  error.retryable = true;
  return error;
}

export class BrokerClient {
  constructor({
    socketPath,
    retryWindowMs = DEFAULT_RETRY_WINDOW_MS,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = {}) {
    if (typeof socketPath !== 'string' || socketPath.length === 0) {
      throw new TypeError('socketPath is required');
    }
    this.socketPath = socketPath;
    this.retryWindowMs = retryWindowMs;
    this.retryIntervalMs = retryIntervalMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.nextId = 1;
  }

  async request(op, params = {}) {
    const id = this.nextId++;
    const deadline = Date.now() + this.retryWindowMs;
    while (true) {
      try {
        return await this.requestOnce({ id, op, params });
      } catch (error) {
        if (!retryableConnectionError(error) || Date.now() >= deadline) throw error;
        await delay(Math.min(this.retryIntervalMs, Math.max(0, deadline - Date.now())));
      }
    }
  }

  requestOnce(request) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      let buffered = '';
      let settled = false;
      const timer = setTimeout(() => {
        finishReject(Object.assign(new Error(`broker request timed out: ${request.op}`), {
          code: 'BROKER_REQUEST_TIMEOUT',
          retryable: true,
        }));
      }, this.requestTimeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeAllListeners();
        socket.destroy();
      };
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      socket.setEncoding('utf8');
      socket.once('connect', () => {
        socket.write(`${JSON.stringify(request)}\n`);
      });
      socket.on('data', (chunk) => {
        buffered += chunk;
        const newline = buffered.indexOf('\n');
        if (newline === -1) return;
        let response;
        try {
          response = JSON.parse(buffered.slice(0, newline));
        } catch (error) {
          finishReject(new TerminalError('INVALID_RESPONSE', `broker returned invalid JSON: ${error.message}`));
          return;
        }
        if (response?.id !== request.id) {
          finishReject(new TerminalError('INVALID_RESPONSE', 'broker response id does not match request id'));
          return;
        }
        if (response?.ok === true) {
          finishResolve(response.result);
          return;
        }
        const payload = response?.error ?? {};
        finishReject(new TerminalError(
          typeof payload.code === 'string' ? payload.code : 'BROKER_ERROR',
          typeof payload.message === 'string' ? payload.message : 'broker request failed',
          payload.details,
        ));
      });
      socket.once('error', finishReject);
      socket.once('close', () => {
        if (!settled && !buffered.includes('\n')) finishReject(closedEarlyError());
      });
    });
  }
}
