import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allStops, getFleet, getStops } from '../src/lib/itineraries.ts';
import { SHIPS } from '../src/lib/ships.ts';
import { validateJourney } from '../src/lib/journey.ts';

test('missing optional itinerary file leaves ships selectable without inventing stops', () => {
  const oldPath = process.env.AHOIER_ITINERARY_FILE;
  process.env.AHOIER_ITINERARY_FILE = join(tmpdir(), `ahoier-missing-${randomUUID()}.csv`);
  try {
    assert.deepEqual(allStops(), []);
    const fleet = getFleet();
    assert.deepEqual(fleet.map(ship => ship.name).sort(), [...SHIPS].sort());
    assert.ok(fleet.every(ship => ship.count === 0 && !ship.firstDate && !ship.lastDate));
    const journey = { ship: 'AIDAcosma', from: '2026-10-01', to: '2026-10-07' };
    assert.equal(validateJourney(journey, fleet), null);
    assert.deepEqual(getStops(journey), []);
  } finally {
    if (oldPath === undefined) delete process.env.AHOIER_ITINERARY_FILE;
    else process.env.AHOIER_ITINERARY_FILE = oldPath;
  }
});
