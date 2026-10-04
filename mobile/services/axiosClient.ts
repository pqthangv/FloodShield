import axios from 'axios';
import {DEFAULT_API_URL} from '../config';
import storage from './storage';

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

// Identify the device so users can manage their own posts (no account needed).
axiosClient.interceptors.request.use(async config => {
  config.headers.set('X-Device-Id', await storage.getDeviceId());
  return config;
});

axiosClient.interceptors.response.use(
  response => response.data,
  error => Promise.reject(error),
);

/** User-friendly Vietnamese message for a failed request. */
export function errorMessage(error: any): string {
  if (error?.response?.data?.detail && typeof error.response.data.detail === 'string') {
    return error.response.data.detail;
  }
  if (error?.code === 'ECONNABORTED') {
    return 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.';
  }
  if (!error?.response) {
    return 'Không kết nối được máy chủ. Kiểm tra kết nối mạng.';
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}

export default axiosClient;
