'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getMachineId, readWindowsMachineGuid } = require('../shared/machine-id.cjs');

test('machine id is stable 64-char hex on Windows or fallback file', () => {
  const guid = readWindowsMachineGuid();
  if (guid) assert.match(guid, /^[0-9a-f-]{36}$/);
  const id1 = getMachineId();
  const id2 = getMachineId();
  assert.equal(id1, id2);
  assert.match(id1, /^[0-9a-f]{64}$/);
});
