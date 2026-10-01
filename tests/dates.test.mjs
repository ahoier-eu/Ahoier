import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDatePreferences, decodeDatePreferences } from '../src/lib/dates.ts';

const valid = { age: 32, intent: 'Kennenlernen', preferred: ['Frauen'], minAge: 28, maxAge: 40, status: 'private', about: 'Kaffee und Spaziergänge' };

test('dating preferences require an adult and a coherent age range', () => {
  assert.equal(validateDatePreferences(valid), null);
  assert.ok(validateDatePreferences({ ...valid, age: 17 }));
  assert.ok(validateDatePreferences({ ...valid, minAge: 41, maxAge: 40 }));
  assert.ok(validateDatePreferences({ ...valid, preferred: [] }));
  assert.ok(validateDatePreferences({ ...valid, preferred: ['Frauen', 'Frauen'] }));
});

test('only a complete active local record is restored', () => {
  const record = { version: 1, active: true, ...valid, consentedAt: '2026-09-30T12:00:00.000Z' };
  assert.deepEqual(decodeDatePreferences(JSON.stringify(record)), record);
  assert.equal(decodeDatePreferences(JSON.stringify({ ...record, age: 16 })), null);
  assert.equal(decodeDatePreferences(JSON.stringify({ ...record, active: false })), null);
  assert.equal(decodeDatePreferences('{broken'), null);
});
