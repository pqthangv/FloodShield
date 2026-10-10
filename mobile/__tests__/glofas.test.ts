import {annualMaxima, pickRiverCell} from '../services/glofas';
import fixture from './fixtures/glofas.json';

// The same sample data and answers as backend/tests/test_app_sync.py, which checks flood.py:
// the phone and the server must pick the same river and see the same yearly peaks.

test('picks the closest cell on the main river, like the server', () => {
  const [lat, lon] = fixture.snapped;
  expect(pickRiverCell(fixture.cells, lat, lon)).toEqual(fixture.expected_cell);
  expect(pickRiverCell([], lat, lon)).toBeNull();
});

test('keeps the peak of each nearly complete year, like the server', () => {
  const {time, river_discharge} = fixture.history;
  expect(annualMaxima(time, river_discharge)).toEqual(fixture.expected_maxima);
});
