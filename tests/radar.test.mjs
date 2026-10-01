import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../src/lib/community.ts';
import { radarMeetings, CONVERSATION_PROMPTS } from '../src/lib/radar.ts';

const meetings = examples('2026-10-01').meetings;

test('radar shows only open meetings matching the selected activity', () => {
  assert.deepEqual(radarMeetings(meetings, 'Spiele', { interests: [] }).map(m => m.id), ['demo-family', 'demo-games']);
  assert.equal(radarMeetings(meetings, 'Landgang', { interests: [] }).length, 0);
  assert.equal(radarMeetings(meetings, 'Kaffee', { interests: [] })[0].id, 'demo-coffee');
});

test('full and cancelled meetings are not recommended', () => {
  const closed = meetings.map((meeting, i) => i === 0 ? { ...meeting, capacity: meeting.members.length } : i === 1 ? { ...meeting, cancelled: true } : meeting);
  assert.deepEqual(radarMeetings(closed, 'Alle', { interests: [] }).map(m => m.id), ['demo-coffee', 'demo-family']);
});

test('profile interests influence general ordering without excluding other options', () => {
  const result = radarMeetings(meetings, 'Alle', { interests: ['Spiele'] });
  assert.deepEqual(result.slice(0, 2).map(m => m.id), ['demo-family', 'demo-games']);
  assert.equal(result.length, 4);
  assert.ok(CONVERSATION_PROMPTS.every(prompt => prompt.endsWith('?')));
});

test('family travel preference promotes family-friendly meetings without hiding other options', () => {
  const result = radarMeetings(meetings, 'Alle', { interests: [], travelGroup: 'family' });
  assert.equal(result[0].id, 'demo-family');
  assert.equal(result.length, 4);
});
