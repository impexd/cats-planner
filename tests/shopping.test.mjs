import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// Run the production transport, queue replay and submit handler without starting the Telegram UI.
function declaration(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const code = [
  declaration('async function api(', 'let refreshTask'),
  declaration('async function retryPending(', '\n'),
  declaration('async function saveShoppingItem(', 'function psShopping(c)')
].join('\n');

function setup(responseMode) {
  const items = new Map();
  const attempts = [];
  const pendingWrites = new Map();
  const state = {uid: 123, generation: 'test-generation'};
  const client = vm.createContext({
    pendingWrites, state, crypto, tg: {initData: 'test'}, window: {PLANNER_API: ''},
    replayBusy: false, loading: false, authorized: () => true, refresh: async () => {},
    persistVault: async () => true, connectionState() {}, showMessage() {},
    async fetch(path, options) {
      if (path === '/api/state') return Response.json(state);
      assert.equal(path, '/api/items');
      assert.equal(options.headers['X-Planner-Generation'], state.generation);
      const data = JSON.parse(options.body);
      attempts.push(data.request_id);
      if (responseMode === 'invalid') return Response.json({detail: 'invalid'}, {status: 422});
      if (!items.has(data.request_id)) items.set(data.request_id, data);
      if (attempts.length === 1) {
        if (responseMode === 'disconnect') throw new TypeError('offline');
        if (responseMode === 'truncated') return new Response('{');
      }
      return Response.json({ok: true});
    }
  });
  vm.runInContext(code, client);
  return {client, items, attempts, pendingWrites};
}

for (const mode of ['disconnect', 'truncated']) {
  test('replays the same shopping operation after ' + mode, async () => {
    const {client, items, attempts, pendingWrites} = setup(mode);
    assert.equal(await client.saveShoppingItem(7, 'Молоко', '2'), true);
    assert.equal(pendingWrites.size, 1);
    await client.retryPending();
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0], attempts[1]);
    assert.equal(items.size, 1);
    assert.equal(items.get(attempts[0]).ps_qty, '2');
    assert.equal(pendingWrites.size, 0);
  });
}

test('a validation error keeps the form editable and creates no queued write', async () => {
  const {client, pendingWrites} = setup('invalid');
  assert.equal(await client.saveShoppingItem(7, 'Молоко', '2'), false);
  assert.equal(pendingWrites.size, 0);
});
