/**
 * Where the app finds the FloodShield API (the FastAPI project in ../backend).
 *
 * Development (debug builds): run the API on your PC on port 8000, then run
 *   npm run api-tunnel
 * so the emulator / USB-connected phone can reach it at localhost:8000.
 *
 * Production (release builds for Google Play): deploy the API with HTTPS and put its URL here.
 * The server address can also be changed at runtime in Cài đặt > Máy chủ API.
 */
const DEV_API_URL = 'http://localhost:8000/api/v1';
const PROD_API_URL = 'https://floodshield-api-ese8.onrender.com/api/v1';

export const DEFAULT_API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

export const APP_VERSION = '1.0.0';
