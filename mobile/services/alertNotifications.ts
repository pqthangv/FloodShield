import {PermissionsAndroid, Platform} from 'react-native';
import AlertScheduler from '../specs/NativeAlertScheduler';
import {getApiBaseUrl} from './axiosClient';
import {getLanguage, translate} from '../i18n';

/** Android 13+ requires asking before showing notifications. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return true;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) {
    return true;
  }
  const result = await PermissionsAndroid.request(permission, {
    title: translate('notifPermTitle'),
    message: translate('notifPermMessage'),
    buttonPositive: translate('notifPermAllow'),
    buttonNegative: translate('notifPermLater'),
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Tells the background checker where to look, in which language, and whether it should run. */
export function syncAlertScheduler(
  latitude: number,
  longitude: number,
  enabled: boolean,
) {
  AlertScheduler?.configure(getApiBaseUrl(), latitude, longitude, enabled, getLanguage());
}

/** Alerts the user already saw in the app should not pop up as notifications later. */
export function markAlertsSeen(ids: string[]) {
  if (ids.length) {
    AlertScheduler?.markSeen(ids);
  }
}

export function checkAlertsNow() {
  AlertScheduler?.checkNow();
}
