/**
 * Downloads the river data (GloFAS, via Open-Meteo's Flood API) directly from the phone, for the
 * same reason as openMeteo.ts: the free daily limit is per IP address, and the server's address
 * is shared with many other apps. The server still does all the work (flood levels, risk, texts):
 * the app sends this raw data with POST /flood and POST /alerts.
 *
 * Three downloads, the same as backend/services/flood.py (a backend test checks the constants):
 * - which river: a 7x7 grid around the user (kept 30 days: rivers don't move);
 * - its history: the largest flow of each of the past 20 years (kept a year);
 * - its forecast: the next 16 days.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {APP_USER_AGENT} from '../config';

export const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';
export const GRID_STEP = 0.05;
export const GRID_RADIUS = 3;
export const SEARCH_SNAP = 0.1;
export const MIN_RIVER_DISCHARGE = 5.0;
export const HISTORY_YEARS = 20;
export const FORECAST_VARS = 'river_discharge,river_discharge_p25,river_discharge_p75';
export const PAST_DAYS = 3;
export const FORECAST_DAYS = 16;

const DAY_MS = 24 * 3600 * 1000;
const CELL_DAYS = 30;
const HISTORY_DAYS = 365;
const FORECAST_MINUTES = 60;

export interface RiverCell {
  latitude: number;
  longitude: number;
  median_discharge: number;
}

/** What POST /flood and POST /alerts receive. `cell` null: no river near the user. */
export interface FloodData {
  cell: RiverCell | null;
  forecast?: object;
  annual_maxima?: number[];
}

const round = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
export const snapTo = (value: number, step: number) => round(Math.round(value / step) * step, 4);

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Same as pick_river_cell in flood.py: on the main river, the cell closest to the user. */
export function pickRiverCell(cells: RiverCell[], latS: number, lonS: number): RiverCell | null {
  if (!cells.length) {
    return null;
  }
  const largest = Math.max(...cells.map(c => c.median_discharge));
  const mainRiver = cells.filter(c => c.median_discharge >= 0.5 * largest);
  const distance = (c: RiverCell) => haversineKm(latS, lonS, c.latitude, c.longitude);
  return mainRiver.reduce((best, c) => (distance(c) < distance(best) ? c : best));
}

/** Same as annual_maxima in flood.py: the largest flow of each year with nearly complete data. */
export function annualMaxima(times: string[], values: (number | null)[]): number[] {
  const byYear = new Map<string, number[]>();
  times.forEach((day, i) => {
    const v = values[i];
    if (v !== null && v !== undefined) {
      const year = day.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) || []), v]);
    }
  });
  return [...byYear.values()].filter(v => v.length >= 300).map(v => Math.max(...v));
}

async function getJson(url: string, timeoutMs = 25000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {headers: {'User-Agent': APP_USER_AGENT}, signal: controller.signal});
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A value saved on the phone for `days`, or a fresh download (not saved when it failed). */
async function kept<T>(key: string, days: number, load: () => Promise<T | undefined>) {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(key)) || 'null');
    if (saved && Date.now() - saved.at < days * DAY_MS) {
      return saved.value as T;
    }
  } catch {}
  const value = await load();
  if (value !== undefined) {
    await AsyncStorage.setItem(key, JSON.stringify({at: Date.now(), value})).catch(() => {});
  }
  return value;
}

/** The river cell to watch (null: none nearby), or undefined when the download failed. */
function findRiverCell(lat: number, lon: number) {
  const latS = snapTo(lat, SEARCH_SNAP);
  const lonS = snapTo(lon, SEARCH_SNAP);
  return kept<RiverCell | null>(`river-cell:${latS}:${lonS}`, CELL_DAYS, async () => {
    const lats: number[] = [];
    const lons: number[] = [];
    for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) {
      for (let j = -GRID_RADIUS; j <= GRID_RADIUS; j++) {
        lats.push(round(latS + i * GRID_STEP, 3));
        lons.push(round(lonS + j * GRID_STEP, 3));
      }
    }
    const data = await getJson(
      `${FLOOD_URL}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
        '&daily=river_discharge_median&forecast_days=1',
    );
    if (!data) {
      return undefined;
    }
    const cells: RiverCell[] = [];
    for (const cell of Array.isArray(data) ? data : [data]) {
      const value = cell?.daily?.river_discharge_median?.[0];
      if (typeof value === 'number') {
        // Open-Meteo's own coordinates for the cell: the server knows rivers by them.
        cells.push({latitude: cell.latitude, longitude: cell.longitude, median_discharge: value});
      }
    }
    const found = pickRiverCell(cells, latS, lonS);
    return found && found.median_discharge >= MIN_RIVER_DISCHARGE ? found : null;
  });
}

function fetchHistory(cell: RiverCell) {
  return kept<number[]>(`river-history:${cell.latitude}:${cell.longitude}`, HISTORY_DAYS, async () => {
    const lastYear = new Date().getFullYear() - 1;
    const data = await getJson(
      `${FLOOD_URL}?latitude=${cell.latitude}&longitude=${cell.longitude}&daily=river_discharge` +
        `&start_date=${lastYear - HISTORY_YEARS + 1}-01-01&end_date=${lastYear}-12-31`,
      60000,
    );
    const daily = data?.daily;
    return daily ? annualMaxima(daily.time || [], daily.river_discharge || []) : undefined;
  });
}

let recent: {key: string; at: number; data: Promise<FloodData | null>} | null = null;

/**
 * The river data for a location, or null when the phone can't get it (then the server tries).
 * Kept for an hour, so the River tab and the alerts share one download.
 */
export function fetchFloodData(lat: number, lon: number): Promise<FloodData | null> {
  const key = `${snapTo(lat, SEARCH_SNAP)}:${snapTo(lon, SEARCH_SNAP)}`;
  if (recent && recent.key === key && Date.now() - recent.at < FORECAST_MINUTES * 60000) {
    return recent.data;
  }
  const data = (async (): Promise<FloodData | null> => {
    const cell = await findRiverCell(lat, lon);
    if (cell === undefined) {
      return null;
    }
    if (cell === null) {
      return {cell: null};
    }
    const [forecast, history] = await Promise.all([
      getJson(
        `${FLOOD_URL}?latitude=${cell.latitude}&longitude=${cell.longitude}&daily=${FORECAST_VARS}` +
          `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}`,
      ),
      fetchHistory(cell),
    ]);
    if (!forecast?.daily) {
      return null;
    }
    // Without the history the server can still use flood levels it worked out earlier.
    return {cell, forecast: forecast.daily, annual_maxima: history || []};
  })();
  recent = {key, at: Date.now(), data};
  data.then(result => {
    if (!result && recent?.data === data) {
      recent = null; // don't keep a failure
    }
  });
  return data;
}
