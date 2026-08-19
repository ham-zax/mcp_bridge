import { AdapterStore } from './store.mjs';

const action = process.argv[2];
const stateDir = process.env.SATORI_ADAPTER_STATE_DIR;
if (!stateDir) throw new Error('SATORI_ADAPTER_STATE_DIR is required');

const store = new AdapterStore(stateDir);
try {
  if (action === 'issue') {
    const ttlSeconds = process.argv[3] === undefined ? 3600 : Number(process.argv[3]);
    const issued = store.issueMainCapability(ttlSeconds);
    process.stdout.write(`capability_id: ${issued.id}\ncapability: ${issued.token}\nscope: ${issued.scope}\nexpires_at: ${new Date(issued.expiresMs).toISOString()}\n`);
  } else if (action === 'revoke') {
    const capabilityId = process.argv[3];
    if (!capabilityId) throw new Error('capability ID is required');
    if (!store.revokeCapability(capabilityId)) throw new Error('capability ID was not found');
    process.stdout.write(`revoked_capability_id: ${capabilityId}\n`);
  } else {
    throw new Error('usage: node operator.mjs issue [ttl-seconds] | revoke <capability-id>');
  }
} finally {
  store.close();
}
