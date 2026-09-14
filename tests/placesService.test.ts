import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPlaces, getPlaceDetails } from '../src/services/placesService';

test('searchPlaces returns empty array when input is shorter than 2 characters', async () => {
  const empty = await searchPlaces('');
  assert.deepEqual(empty, []);

  const singleChar = await searchPlaces('a');
  assert.deepEqual(singleChar, []);

  const spacesOnly = await searchPlaces('   ');
  assert.deepEqual(spacesOnly, []);
});

test('getPlaceDetails returns null when placeId is empty', async () => {
  const result = await getPlaceDetails('');
  assert.equal(result, null);
});

test('searchPlaces retrieves predictions and returns normalized structure', async () => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    // Skip external network call if key not in env
    return;
  }

  const results = await searchPlaces('KNUST');
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, 'Should find at least 1 prediction for KNUST');
  assert.ok(results[0].place_id, 'Top result must have place_id');
  assert.ok(results[0].description, 'Top result must have description');
  assert.match(results[0].description, /Kumasi|Ghana/i);

  // Test cache hit (should return same instance rapidly)
  const cached = await searchPlaces('KNUST');
  assert.deepEqual(cached, results);
});
