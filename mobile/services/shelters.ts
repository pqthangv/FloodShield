/**
 * The evacuation places near the user, found once and shared by the app.
 *
 * Finding them is slow: the phone asks OpenStreetMap's Overpass servers, which are often busy
 * (see overpass.ts), and then the server sorts the places. So the app starts the search as soon
 * as it knows where the user is (AppContext), and the shelters screen opens with the result.
 * The last list is kept on the phone for 7 days (schools and ward offices don't move), and an
 * older one is still shown when there is no network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import disasterAPI from '../apis/disasterAPI';
import {haversineKm} from './glofas';
import {Shelter} from './model';

const KEY = 'shelters';
const KEEP_MS = 7 * 24 * 3600 * 1000;
// GPS positions move a little between fixes, and the search covers 5 km (or 15) around the
// user: a list found less than 1 km away is still the right one.
const SAME_PLACE_KM = 1;

interface Place {
  latitude: number;
  longitude: number;
  lang: string;
}

interface SavedList extends Place {
  at: number;
  shelters: Shelter[];
}

let saved: SavedList | null = null;
let restoring: Promise<void> | null = null;
let searching: (Place & {request: Promise<Shelter[]>}) | null = null;

const near = (place: Place, lat: number, lon: number) =>
  haversineKm(place.latitude, place.longitude, lat, lon) <= SAME_PLACE_KM;

/** The distances from (lat, lon), in the server's order: the administrator's shelters first,
 * then the OpenStreetMap places, each group nearest first. */
function fromHere(shelters: Shelter[], lat: number, lon: number): Shelter[] {
  const measured = shelters.map(s => ({
    ...s,
    distance_km: Math.round(haversineKm(lat, lon, s.latitude, s.longitude) * 100) / 100,
  }));
  const nearestFirst = (a: Shelter, b: Shelter) => a.distance_km - b.distance_km;
  return [
    ...measured.filter(s => s.official).sort(nearestFirst),
    ...measured.filter(s => !s.official).sort(nearestFirst),
  ];
}

/** Reads the list kept on the phone, once, however many callers ask at the same time. */
function restore() {
  if (!restoring) {
    restoring = (async () => {
      try {
        const value = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
        if (!saved && Array.isArray(value?.shelters)) {
          saved = value;
        }
      } catch {}
    })();
  }
  return restoring;
}

/** The recent list for this place and language, if it's already in memory: the screen shows
 * it at once, without a loading spinner. */
export function savedShelters(lat: number, lon: number, lang: string): Shelter[] | null {
  if (saved && saved.lang === lang && near(saved, lat, lon) && Date.now() - saved.at < KEEP_MS) {
    return fromHere(saved.shelters, lat, lon);
  }
  return null;
}

async function search(lat: number, lon: number, lang: string): Promise<Shelter[]> {
  try {
    const {shelters} = await disasterAPI.getShelters(lat, lon);
    saved = {at: Date.now(), latitude: lat, longitude: lon, lang, shelters};
    AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {});
    return shelters;
  } catch (e) {
    // No network, or no server answers: an older list from here beats nothing.
    if (saved && near(saved, lat, lon)) {
      return saved.shelters;
    }
    throw e;
  }
}

/**
 * The places near (lat, lon): the kept list when it's recent and from here, otherwise a new
 * search (`refresh`: always search). A search already running for this place, like the one
 * started when the app opened, is shared rather than started twice.
 */
export async function loadShelters(
  lat: number,
  lon: number,
  lang: string,
  refresh = false,
): Promise<Shelter[]> {
  await restore();
  const kept = refresh ? null : savedShelters(lat, lon, lang);
  if (kept) {
    return kept;
  }
  if (!searching || searching.lang !== lang || !near(searching, lat, lon)) {
    const current = {latitude: lat, longitude: lon, lang, request: search(lat, lon, lang)};
    searching = current;
    current.request
      .finally(() => {
        if (searching === current) {
          searching = null;
        }
      })
      .catch(() => {});
  }
  return fromHere(await searching.request, lat, lon);
}

/** Starts finding the places in the background, so the shelters screen opens with them. */
export function prefetchShelters(lat: number, lon: number, lang: string) {
  loadShelters(lat, lon, lang).catch(() => {});
}
