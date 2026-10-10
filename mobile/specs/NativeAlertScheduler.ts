import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * Background alert checker: it asks the API for alerts at the last known location and shows a
 * notification for each new moderate/high/severe alert, even when the app is closed.
 * - Android (android/.../alerts/AlertWorker.kt): every ~30 minutes with WorkManager.
 * - iOS (ios/FloodShield/FSAlertScheduler.mm): Background App Refresh, which iOS runs when it
 *   decides (often a few times a day), so the app also checks every time it is opened.
 */
export interface Spec extends TurboModule {
  configure(
    apiBaseUrl: string,
    latitude: number,
    longitude: number,
    enabled: boolean,
    /** 'vi' or 'en': language of the notification texts (sent as Accept-Language). */
    language: string,
  ): void;
  /** Alerts already shown inside the app, so the worker does not notify them again. */
  markSeen(ids: string[]): void;
  /** Runs one check immediately (useful for testing). */
  checkNow(): void;
}

// `get` (not `getEnforcing`) so the app still runs where the module does not exist (tests).
export default TurboModuleRegistry.get<Spec>('AlertScheduler');
