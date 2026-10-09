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

export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  // The two servers behind the main address, for when it sends us to the busy one.
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  // A separate server (VK), often slow.
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

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

/** Places within radiusKm, or null when no Overpass server answers the phone. */
export async function fetchPlaces(lat: number, lon: number, radiusKm: number): Promise<OverpassElement[] | null> {
  const body = `data=${encodeURIComponent(overpassQuery(lat, lon, radiusKm))}`;
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    // The query itself gives up after 25 s ([timeout:25]); several servers to try, so don't wait longer.
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': APP_USER_AGENT},
        body,
        signal: controller.signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        // The server skips places without a name, so don't upload them.
        return (data.elements ?? [])
          .filter((el: OverpassElement) => el.tags?.name || el.tags?.['name:vi'])
          .map(trim);
      }
    } catch {
      // No answer in time: try the next server.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
