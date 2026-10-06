import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform} from 'react-native';
import {translate} from '../i18n';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

// Quick choices when GPS is unavailable (and for testing on the emulator).
export const DEFAULT_LOCATIONS = [
  {name: 'TP. Hồ Chí Minh', nameEn: 'Ho Chi Minh City', latitude: 10.7769, longitude: 106.7009},
  {name: 'Hà Nội', nameEn: 'Hanoi', latitude: 21.0285, longitude: 105.8542},
  {name: 'Đà Nẵng', nameEn: 'Da Nang', latitude: 16.0471, longitude: 108.2068},
  {name: 'Huế', nameEn: 'Hue', latitude: 16.4637, longitude: 107.5909},
  {name: 'Cần Thơ', nameEn: 'Can Tho', latitude: 10.0452, longitude: 105.7469},
  {name: 'Đồng Tháp (Cao Lãnh)', nameEn: 'Dong Thap (Cao Lanh)', latitude: 10.4591, longitude: 105.6384},
  {name: 'Quảng Ngãi', nameEn: 'Quang Ngai', latitude: 15.1214, longitude: 108.8044},
  {name: 'Lào Cai', nameEn: 'Lao Cai', latitude: 22.4856, longitude: 103.9707},
];

class LocationService {
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

  /** Current GPS position. Rejects with a translated message when it cannot be obtained. */
  async getCurrentPosition(): Promise<LocationCoords> {
    const allowed = await this.requestLocationPermission();
    if (!allowed) {
      throw new Error(translate('errLocationPermission'));
    }
    const attempt = (highAccuracy: boolean) =>
      new Promise<LocationCoords>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          position =>
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          error => reject(error),
          {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 15000 : 10000,
            maximumAge: 5 * 60 * 1000,
          },
        );
      });
    try {
      // Network/Wi-Fi location is fast and accurate enough for forecasts.
      return await attempt(false);
    } catch {
      try {
        return await attempt(true);
      } catch (error: any) {
        if (error?.code === 1) {
          throw new Error(translate('errLocationPermission'));
        }
        throw new Error(translate('errLocationUnavailable'));
      }
    }
  }
}

export default new LocationService();
