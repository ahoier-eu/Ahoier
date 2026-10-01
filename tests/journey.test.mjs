import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseCSV, parseItineraries, isISODate, addDays, shipLocalDateTime, validateJourney } from '../src/lib/journey.ts';

test('CSV preserves quoted separators, escaped quotes and multiline fields', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"hello, world","say ""hi""\nagain"\r\n'), [['a','b'],['hello, world','say "hi"\nagain']]);
  assert.throws(() => parseCSV('a,"unfinished'), /Unterminated/);
});
test('date validation rejects impossible dates and handles leap years', () => {
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('2028-02-29'), true);
  assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  const fleet = [{name:'AIDAcosma'}];
  assert.equal(validateJourney({ship:'AIDAcosma',from:'2026-09-30',to:'2026-10-07'}, fleet), null);
  for (const journey of [{ship:'unknown',from:'2026-09-30',to:'2026-10-07'}, {ship:'AIDAcosma',from:'2026-09-30',to:'2026-09-29'}, {ship:'AIDAcosma',from:'2026-09-30',to:'2026-12-01'}]) assert.ok(validateJourney(journey, fleet));
});

test('prototype ship clock uses the Berlin calendar date across UTC midnight', () => {
  assert.deepEqual(shipLocalDateTime(new Date('2026-09-30T22:30:00Z')), { date: '2026-10-01', time: '00:30' });
  assert.deepEqual(shipLocalDateTime(new Date('2026-01-01T23:30:00Z')), { date: '2026-01-02', time: '00:30' });
});
test('deduplication keeps different calls on the same day', () => {
  const header='ship,date,location,eta,etd,call_type,country,pier,cruise_nr,cruise_name\n';
  const row='AIDAcosma,2026-09-30,Palma,08:00,18:00,port,Spain,,,Trip\n';
  const stops = parseItineraries(header+row+row+'AIDAcosma,2026-09-30,At Sea,,,sea day,,,,Trip\n');
  assert.equal(stops.length,2);
  assert.equal(stops.filter(s=>s.seaDay).length,1);
});
test('optional imported dataset includes 11 ships with valid unique stops', { skip: !existsSync(new URL('../data/itineraries.csv', import.meta.url)) }, () => {
  const stops=parseItineraries(readFileSync(new URL('../data/itineraries.csv', import.meta.url),'utf8'));
  assert.equal(new Set(stops.map(s=>s.ship)).size,11);
  assert.ok(stops.length>5000);
  assert.equal(new Set(stops.map(s=>s.id)).size,stops.length);
  assert.ok(stops.every(s=>isISODate(s.date)));
});
