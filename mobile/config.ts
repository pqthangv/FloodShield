import {Platform} from 'react-native';

/**
 * Where the app finds the FloodShield API (the FastAPI project in ../backend).
 *
 * Development (debug builds): run the API on your PC on port 8000, then run
 *   npm run api-tunnel
 * so the emulator / USB-connected phone can reach it at localhost:8000.
 *
 * Production (release builds for Google Play): deploy the API with HTTPS and put its URL here.
 * Debug builds can also switch server at runtime: Settings > tap the version > API server.
 */
const DEV_API_URL = 'http://localhost:8000/api/v1';
const PROD_API_URL = 'https://floodshield-api-ese8.onrender.com/api/v1';

export const DEFAULT_API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

// Same as package.json, versionName (Android) and MARKETING_VERSION (Xcode); a backend test checks.
export const APP_VERSION = '1.0.6';

/**
 * Sent when the phone calls Overpass and Open-Meteo itself. OpenStreetMap's usage policy asks apps
 * to identify themselves, and Overpass refuses the default "okhttp" one (HTTP 406).
 */
export const APP_USER_AGENT = `FloodShield/${APP_VERSION} (${
  Platform.OS === 'ios' ? 'iOS' : 'Android'
} app; https://github.com/pqthangv/FloodShield)`;
