import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUserSettings } from '../src/extension/types.ts';

test('normalizes legacy copy settings to the list format', () => {
  assert.deepEqual(
    normalizeUserSettings({
      context: { mode: 'words', range: 3 },
      copy: { customText: 'Append this' }
    }),
    {
      context: { mode: 'words', range: 3 },
      copy: { customText: 'Append this', format: 'list', includeContext: true }
    }
  );
});

test('preserves selected format and optional context preference', () => {
  assert.deepEqual(
    normalizeUserSettings({
      copy: { customText: '', format: 'table', includeContext: false }
    }).copy,
    { customText: '', format: 'table', includeContext: false }
  );
});

test('uses safe defaults for unsupported copy settings', () => {
  assert.deepEqual(
    normalizeUserSettings({
      copy: { customText: 4, format: 'json', includeContext: 'yes' }
    }).copy,
    { customText: '', format: 'list', includeContext: true }
  );
});
