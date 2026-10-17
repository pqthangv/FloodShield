/* Asking the Overpass servers (services/overpass.ts), with a fake fetch. */
import {fetchPlaces, LIMIT_MS, OVERPASS_URLS} from '../services/overpass';

interface Asked {
  url: string;
  signal: AbortSignal;
  answer: (status: number, data?: unknown) => void;
  fail: () => void;
}

let asked: Asked[];
const realFetch = globalThis.fetch;

beforeEach(() => {
  asked = [];
  globalThis.fetch = jest.fn(
    (url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new Error('Aborted')));
        asked.push({
          url,
          signal,
          answer: (status, data) => resolve({ok: status >= 200 && status < 300, status, json: async () => data}),
          fail: () => reject(new TypeError('Network request failed')),
        });
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

const school = {type: 'way', id: 1, center: {lat: 16.46, lon: 107.59}, tags: {name: 'Trường A', amenity: 'school', wheelchair: 'yes'}};
const nameless = {type: 'node', id: 2, lat: 16.47, lon: 107.6, tags: {amenity: 'school'}};
const ok = {elements: [school, nameless]};
const found = [{...school, lat: undefined, lon: undefined, tags: {name: 'Trường A', amenity: 'school'}}];

/** Lets the fake answers and the code after them run. */
const settle = () => new Promise<void>(resolve => setImmediate(() => resolve()));

test('asks the three machines at once, and not the main address (the same machine as z)', async () => {
  fetchPlaces(16.46, 107.59, 5);
  expect(asked.map(a => a.url)).toEqual(OVERPASS_URLS);
  expect(OVERPASS_URLS).toHaveLength(3);
  expect(OVERPASS_URLS).not.toContain('https://overpass-api.de/api/interpreter');
  asked.forEach(a => a.fail());
});

test('the first good answer is used, and the others are cancelled', async () => {
  const places = fetchPlaces(16.46, 107.59, 5);
  asked[2].answer(200, ok);
  expect(await places).toEqual(found);
  expect(asked[0].signal.aborted).toBe(true);
  expect(asked[1].signal.aborted).toBe(true);
});

test('a busy server, or a query that ran out of time or memory, does not win', async () => {
  const places = fetchPlaces(16.46, 107.59, 5);
  asked[0].answer(504);
  asked[1].answer(200, {
    elements: [],
    remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.',
  });
  await settle();
  asked[2].answer(200, ok);
  expect(await places).toEqual(found);
});

test('a real "nothing here" answer is used (the app then looks wider)', async () => {
  const places = fetchPlaces(16.46, 107.59, 5);
  asked[1].answer(200, {elements: []});
  expect(await places).toEqual([]);
});

test('when every server fails: null', async () => {
  const places = fetchPlaces(16.46, 107.59, 5);
  asked[0].answer(429);
  asked[1].fail();
  asked[2].answer(200, '<html>Bad gateway</html>');
  expect(await places).toBeNull();
});

test('a slow answer within the limit is used; nothing by the limit: null, all cancelled', async () => {
  jest.useFakeTimers();
  const slow = fetchPlaces(16.46, 107.59, 5);
  await jest.advanceTimersByTimeAsync(LIMIT_MS - 100);
  asked[0].answer(200, ok);
  expect(await slow).toEqual(found);

  const none = fetchPlaces(16.46, 107.59, 5);
  await jest.advanceTimersByTimeAsync(LIMIT_MS);
  expect(await none).toBeNull();
  expect(asked.slice(3).every(a => a.signal.aborted)).toBe(true);
});
