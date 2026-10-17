import Geolocation, {
  GeolocationError,
  GeolocationResponse,
} from '@react-native-community/geolocation';
import {AppState, PermissionsAndroid, Platform} from 'react-native';
import {translate} from '../i18n';

// iOS: ask only "While Using the App". The library would otherwise pick the level from Info.plist,
// and FloodShield never needs location in the background (the alert checker uses the saved place).
if (Platform.OS === 'ios') {
  Geolocation.setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse'});
}
// Android: Google's fused location (Wi-Fi, phone towers and GPS together). The library's default
// is Android's old LocationManager, which asks one source at a time: slow indoors, and nothing at
// all when network location is off or only "Approximate" is allowed. Phones without Google Play
// services stay on the old one (the library checks).
if (Platform.OS === 'android') {
  Geolocation.setRNConfiguration({skipPermissionRequests: false, locationProvider: 'playServices'});
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

// How long to look for the position. It only counts while the app is on screen: the iPhone's
// "Allow location?" question, or a look at another app, doesn't use it up.
export const LIMIT_MS = 20 * 1000;
// A position found this recently is still good (and comes at once, without searching).
export const MAX_AGE_MS = 5 * 60 * 1000;
const PERMISSION_DENIED = 1;
// Errors that mean no position can come at all: location turned off on the phone, or not allowed
// for this app. These are the messages of @react-native-community/geolocation 3.4.0; any other error
// (indoors, GPS still searching) only means waiting until the limit, and so would these if a library
// update changed them.
const LOCATION_OFF =
  /FusedLocationProvider\/settings|No location provider available|not authorized to use location services|Location services disabled/;

// Quick choices when GPS is unavailable (and for testing on the emulator).
export const DEFAULT_LOCATIONS = [
  {name: 'TP. Hồ Chí Minh', nameEn: 'Ho Chi Minh City', latitude: 10.7769, longitude: 106.7009},
  {name: 'Hà Nội', nameEn: 'Hanoi', latitude: 21.0285, longitude: 105.8542},
  {name: 'Đà Nẵng', nameEn: 'Da Nang', latitude: 16.0471, longitude: 108.2068},
  {name: 'Huế', nameEn: 'Hue', latitude: 16.4637, longitude: 107.5909},
  {name: 'Cần Thơ', nameEn: 'Can Tho', latitude: 10.0452, longitude: 105.7469},
  {name: 'Khánh Hòa (Nha Trang)', nameEn: 'Khanh Hoa (Nha Trang)', latitude: 12.2388, longitude: 109.1967},
  {name: 'Khánh Hòa (Cam Ranh)', nameEn: 'Khanh Hoa (Cam Ranh)', latitude: 11.9214, longitude: 109.1591},
  {name: 'Đồng Tháp (Cao Lãnh)', nameEn: 'Dong Thap (Cao Lanh)', latitude: 10.4591, longitude: 105.6384},
  {name: 'Quảng Ngãi', nameEn: 'Quang Ngai', latitude: 15.1214, longitude: 108.8044},
  {name: 'Lào Cai', nameEn: 'Lao Cai', latitude: 22.4856, longitude: 103.9707},
];

// While unknown (at startup), as on screen.
const onScreen = (state?: string | null) => state !== 'background' && state !== 'inactive';

/**
 * The phone's position: the first one found, or one found in the last MAX_AGE_MS. Rejects with a
 * translated message when location is off or not allowed, or when nothing came within LIMIT_MS
 * (then an older position, if one came, is used instead).
 *
 * It follows the position (watchPosition) and stops at the first good one. The library's
 * getCurrentPosition can't be used alone: with Google's location (Android) it has no time limit,
 * can't be stopped, and goes wrong when two overlap; on iPhone it gives up at the first "not found
 * yet", which iOS reports early indoors while it keeps searching. On iPhone one getCurrentPosition
 * runs alongside (started first, see below), because it answers at once when location is refused,
 * or with a recent position.
 */
function findPosition(): Promise<LocationCoords> {
  return new Promise((resolve, reject) => {
    let done = false;
    let limit: ReturnType<typeof setTimeout> | null = null;
    let watchId: number | null = null;
    let older: LocationCoords | null = null;

    const pause = () => {
      if (limit) {
        clearTimeout(limit);
        limit = null;
      }
    };
    const finish = (outcome: () => void) => {
      if (done) {
        return;
      }
      done = true;
      pause();
      screen.remove();
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
      outcome();
    };
    const fail = (message: 'errLocationPermission' | 'errLocationUnavailable') =>
      finish(() => reject(new Error(translate(message))));

    const startLimit = () => {
      pause();
      limit = setTimeout(() => {
        const found = older;
        finish(() => (found ? resolve(found) : reject(new Error(translate('errLocationUnavailable')))));
      }, LIMIT_MS);
    };
    // Off screen the limit stops; back on screen it starts again from the beginning.
    const screen = AppState.addEventListener('change', state => (onScreen(state) ? startLimit() : pause()));
    if (onScreen(AppState.currentState)) {
      startLimit();
    }

    // A position older than MAX_AGE_MS (the iPhone may first hand back the last one it knew) is
    // kept for the limit, and the search goes on.
    const onPosition = (position: GeolocationResponse) => {
      const coords = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      if (Date.now() - position.timestamp > MAX_AGE_MS) {
        older = coords;
      } else {
        finish(() => resolve(coords));
      }
    };
    // Any other error is "not found yet" (or the iPhone's getCurrentPosition timing out), and the
    // watch goes on.
    const onError = (error: GeolocationError) => {
      if (error.code === PERMISSION_DENIED) {
        fail('errLocationPermission');
      } else if (LOCATION_OFF.test(error.message ?? '')) {
        fail('errLocationUnavailable');
      }
    };

    try {
      // iPhone: the getCurrentPosition before the watch. Asked while a watch runs, the library
      // pauses the watch and never restarts it (it calls the empty startObserving of RCTEventEmitter).
      if (Platform.OS === 'ios') {
        Geolocation.getCurrentPosition(onPosition, onError, {
          enableHighAccuracy: false,
          timeout: LIMIT_MS,
          maximumAge: MAX_AGE_MS,
        });
      }
      if (!done) {
        watchId = Geolocation.watchPosition(onPosition, onError, {
          // Android: Google's high accuracy, which uses Wi-Fi and phone towers too, not only GPS (its
          // low power mode is only about city level). iPhone: about 100 m, from Wi-Fi or GPS as needed.
          enableHighAccuracy: Platform.OS === 'android',
          distanceFilter: 0,
          interval: 1000,
          fastestInterval: 500,
          maximumAge: MAX_AGE_MS,
        });
        // Only possible with a fake library (tests): it answered before returning the id.
        if (done) {
          Geolocation.clearWatch(watchId);
        }
      }
    } catch {
      fail('errLocationUnavailable');
    }
  });
}

class LocationService {
  // The search under way, if any: everyone who asks meanwhile gets its answer (the library's
  // Android code can only follow one search at a time).
  private search: Promise<LocationCoords> | null = null;

  // Request location permission on Android
  async requestLocationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // iOS asks automatically
    }
    try {
      const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
      if (
        (await PermissionsAndroid.check(fine)) ||
        (await PermissionsAndroid.check(coarse))
      ) {
        return true;
      }
      const result = await PermissionsAndroid.requestMultiple([fine, coarse]);
      return (
        result[fine] === PermissionsAndroid.RESULTS.GRANTED ||
        result[coarse] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn('Location permission error:', err);
      return false;
    }
  }

  /** Current position. Rejects with a translated message when it cannot be obtained. */
  getCurrentPosition(): Promise<LocationCoords> {
    if (!this.search) {
      this.search = this.locate().finally(() => {
        this.search = null;
      });
    }
    return this.search;
  }

  private async locate(): Promise<LocationCoords> {
    if (!(await this.requestLocationPermission())) {
      throw new Error(translate('errLocationPermission'));
    }
    return findPosition();
  }
}

export default new LocationService();
