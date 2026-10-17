/**
 * Downloads nearby evacuation places from OpenStreetMap (Overpass) directly from the phone.
 *
 * Like Open-Meteo (see openMeteo.ts), Overpass limits each internet address and refuses our
 * server's shared one. The app downloads the raw places and sends them to the server
 * (POST /shelters), which still sorts them, adds official shelters and translates the labels.
 *
 * Keep the query equal to _overpass_query in backend/services/osm.py (a backend test checks).
 */
import {APP_USER_AGENT} from '../config';

// Asked all at once: the first good answer is used and the others are cancelled. Three different
// machines, so each gets a single request from the phone (Overpass limits each internet address
// per machine, about 2 at a time on overpass-api.de). The main address overpass-api.de is one of
// its two machines (z, on 2026-10-17), so it isn't asked as well.
export const OVERPASS_URLS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  // A separate server (VK).
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
// The query may run 25 s ([timeout:25] below); queueing and the download come on top (lz4 needed
// 24.9 s on 2026-10-17).
export const LIMIT_MS = 30 * 1000;

// The only tags the server reads; dropping the rest keeps the upload small.
export const KEEP_TAGS = [
  'name', 'name:vi', 'name:en', 'amenity', 'emergency', 'social_facility',
  'addr:housenumber', 'addr:street', 'addr:subdistrict', 'addr:ward', 'addr:district',
  'addr:city', 'addr:province', 'phone', 'contact:phone',
];

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: {lat: number; lon: number};
  tags?: Record<string, string>;
}

/** ~2 km grid, like the server: Overpass doesn't learn the exact position. */
const snap = (value: number) => Math.round(Math.round(value / 0.02) * 0.02 * 10000) / 10000;

export function overpassQuery(lat: number, lon: number, radiusKm: number) {
  const latS = snap(lat);
  const lonS = snap(lon);
  // A little wider than asked, because the centre is the snapped point (like the server).
  const radius = radiusKm + 1.5;
  const dLat = radius / 111.0;
  const dLon = radius / (111.0 * Math.max(Math.cos((latS * Math.PI) / 180), 0.01));
  const box = [latS - dLat, lonS - dLon, latS + dLat, lonS + dLon].map(v => v.toFixed(4)).join(',');
  return (
    `[out:json][timeout:25][bbox:${box}];\n` +
    '(\n' +
    '  nwr["emergency"="assembly_point"];\n' +
    '  nwr["social_facility"="shelter"];\n' +
    '  nwr["amenity"="shelter"]["name"]["shelter_type"!="public_transport"];\n' +
    '  nwr["amenity"~"^(school|university|college|community_centre|townhall|hospital|fire_station|police)$"]["name"];\n' +
    ');\n' +
    'out center tags;\n'
  );
}

function trim(el: OverpassElement): OverpassElement {
  const tags: Record<string, string> = {};
  for (const key of KEEP_TAGS) {
    if (el.tags?.[key] !== undefined) {
      tags[key] = el.tags[key];
    }
  }
  return {type: el.type, id: el.id, lat: el.lat, lon: el.lon, center: el.center, tags};
}

/** The first of the promises to succeed; rejects only when they all failed. */
function firstOf<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0;
    for (const promise of promises) {
      promise.then(resolve, () => {
        failed += 1;
        if (failed === promises.length) {
          reject(new Error('No Overpass server answered'));
        }
      });
    }
  });
}

/** Places within radiusKm, or null when no Overpass server answers the phone in time. */
export async function fetchPlaces(lat: number, lon: number, radiusKm: number): Promise<OverpassElement[] | null> {
  const body = `data=${encodeURIComponent(overpassQuery(lat, lon, radiusKm))}`;
  const asks = OVERPASS_URLS.map(url => ({url, controller: new AbortController()}));
  const stopAll = () => asks.forEach(ask => ask.controller.abort());
  const timer = setTimeout(stopAll, LIMIT_MS);
  const ask = async ({url, controller}: (typeof asks)[number]): Promise<OverpassElement[]> => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': APP_USER_AGENT},
      body,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Overpass ${resp.status}`);
    }
    const data = await resp.json();
    // Only a real answer may win over a slower good one: it has a list of places, and no
    // "runtime error" remark (a query that ran out of time or memory still answers 200, with
    // what it found so far, often nothing).
    if (!Array.isArray(data?.elements) || /runtime error/i.test(data.remark ?? '')) {
      throw new Error(`Overpass: ${data?.remark ?? 'not an answer'}`);
    }
    // The server skips places without a name, so don't upload them.
    return data.elements
      .filter((el: OverpassElement) => el.tags?.name || el.tags?.['name:vi'])
      .map(trim);
  };
  try {
    return await firstOf(asks.map(ask));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    // The others are no longer needed.
    stopAll();
  }
}
