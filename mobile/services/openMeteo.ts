/**
 * Downloads the weather forecast from Open-Meteo directly from the phone.
 *
 * Open-Meteo's free limits are per IP address. Our server shares its address with many other
 * apps, so its daily quota runs out; each phone has its own. The app sends this raw forecast to
 * the server (POST /weather, POST /alerts), which still does all the work: descriptions,
 * Vietnamese alert thresholds, translations.
 *
 * Keep these lists equal to CURRENT_VARS / HOURLY_VARS / DAILY_VARS in backend/services/weather.py
 * and to AlertWorker.kt (a backend test checks all three).
 */
import {APP_USER_AGENT} from '../config';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const CURRENT_VARS =
  'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
  'weather_code,wind_speed_10m,wind_gusts_10m';
export const HOURLY_VARS =
  'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,' +
  'wind_gusts_10m';
export const DAILY_VARS =
  'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,' +
  'precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,' +
  'sunrise,sunset';

/**
 * Rounded to ~1 km (ward level) before it leaves the phone. Open-Meteo corrects the temperature for
 * the terrain height at this exact point, which matters in the mountains, so this is finer than the
 * server's shared 5 km cache grid.
 */
export const SNAP_STEP = 0.01;
export const snap = (value: number) => Math.round(Math.round(value / SNAP_STEP) * SNAP_STEP * 10000) / 10000;

export function forecastUrl(lat: number, lon: number) {
  const params = [
    `latitude=${snap(lat)}`,
    `longitude=${snap(lon)}`,
    `current=${CURRENT_VARS}`,
    `hourly=${HOURLY_VARS}`,
    `daily=${DAILY_VARS}`,
    'timezone=auto',
    'forecast_days=7',
    'wind_speed_unit=kmh',
  ];
  return `${FORECAST_URL}?${params.join('&')}`;
}

/** The raw forecast, or null when the phone can't get it (offline, Open-Meteo down...). */
export async function fetchForecast(lat: number, lon: number): Promise<object | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(forecastUrl(lat, lon), {
      headers: {'User-Agent': APP_USER_AGENT},
      signal: controller.signal,
    });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
