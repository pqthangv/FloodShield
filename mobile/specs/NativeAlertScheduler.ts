import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * Android background alert checker (see android/.../alerts/AlertWorker.kt).
 * Every ~30 minutes, even when the app is closed, it asks the API for alerts at the last known
 * location and shows a notification for each new moderate/high/severe alert.
 */
export interface Spec extends TurboModule {
  configure(
    apiBaseUrl: string,
    latitude: number,
    longitude: number,
    enabled: boolean,
  ): void;
  /** Alerts already shown inside the app, so the worker does not notify them again. */
  markSeen(ids: string[]): void;
  /** Runs one check immediately (useful for testing). */
  checkNow(): void;
}

// `get` (not `getEnforcing`) so the app still runs where the module does not exist (iOS, tests).
export default TurboModuleRegistry.get<Spec>('AlertScheduler');
