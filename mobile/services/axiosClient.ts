import axios from 'axios';
import {DEFAULT_API_URL} from '../config';
import storage from './storage';
import {getLanguage, translate} from '../i18n';

let apiBaseUrl = DEFAULT_API_URL;

export const getApiBaseUrl = () => apiBaseUrl;

/** Loads the server address chosen in Settings (if any). Call once at startup. */
export async function initApiBaseUrl() {
  const override = await storage.getApiUrl();
  if (override) {
    apiBaseUrl = override;
  }
  axiosClient.defaults.baseURL = apiBaseUrl;
  return apiBaseUrl;
}

export async function setApiBaseUrl(url: string | null) {
  await storage.setApiUrl(url);
  apiBaseUrl = url || DEFAULT_API_URL;
  axiosClient.defaults.baseURL = apiBaseUrl;
}

const axiosClient = axios.create({
  baseURL: apiBaseUrl,
  // Free hosting plans can take up to a minute to wake up.
  timeout: 60000,
  headers: {
    Accept: 'application/json',
  },
});

// Identify the device so users can manage their own posts (no account needed), and ask the
// API for texts (alerts, weather descriptions, errors) in the app's language.
axiosClient.interceptors.request.use(async config => {
  config.headers.set('X-Device-Id', await storage.getDeviceId());
  config.headers.set('Accept-Language', getLanguage());
  return config;
});

axiosClient.interceptors.response.use(
  response => response.data,
  error => Promise.reject(error),
);

/** User-friendly message for a failed request, in the app's language. */
export function errorMessage(error: any): string {
  if (error?.response?.data?.detail && typeof error.response.data.detail === 'string') {
    return error.response.data.detail;
  }
  if (error?.code === 'ECONNABORTED') {
    return translate('errTimeout');
  }
  if (!error?.response) {
    return translate('errOffline');
  }
  return translate('errGeneric');
}

export default axiosClient;
