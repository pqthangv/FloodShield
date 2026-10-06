import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState} from 'react-native';
import disasterAPI from '../apis/disasterAPI';
import {errorMessage, initApiBaseUrl} from '../services/axiosClient';
import locationService, {DEFAULT_LOCATIONS} from '../services/locationService';
import {getLanguage, translate, useI18n} from '../i18n';
import {Alert, WeatherData} from '../services/model';
import storage, {SavedLocation} from '../services/storage';
import {
  markAlertsSeen,
  requestNotificationPermission,
  syncAlertScheduler,
} from '../services/alertNotifications';

const REFRESH_AFTER_MS = 10 * 60 * 1000;

interface AppContextValue {
  location: SavedLocation | null;
  locationError: string | null;
  locating: boolean;
  weather: WeatherData | null;
  weatherError: string | null;
  alerts: Alert[];
  alertsError: string | null;
  loading: boolean;
  notificationsEnabled: boolean;
  /** Re-reads GPS (in GPS mode) and reloads weather and alerts. */
  refresh: () => Promise<void>;
  switchToGps: () => Promise<void>;
  setManualLocation: (place: {
    name: string;
    latitude: number;
    longitude: number;
  }) => Promise<void>;
  setNotificationsEnabled: (on: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return value;
};

export const AppProvider = ({children}: {children: React.ReactNode}) => {
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notificationsEnabled, setNotifications] = useState(true);
  const lastFetch = useRef(0);
  const locationRef = useRef<SavedLocation | null>(null);
  const notificationsRef = useRef(true);

  const loadData = useCallback(async (loc: SavedLocation) => {
    setLoading(true);
    const [w, a] = await Promise.allSettled([
      disasterAPI.getWeather(loc.latitude, loc.longitude),
      disasterAPI.getAlerts(loc.latitude, loc.longitude),
    ]);
    if (w.status === 'fulfilled') {
      setWeather(w.value);
      setWeatherError(null);
    } else {
      setWeatherError(errorMessage(w.reason));
    }
    if (a.status === 'fulfilled') {
      setAlerts(a.value.alerts);
      setAlertsError(null);
      markAlertsSeen(a.value.alerts.map(item => item.id));
    } else {
      setAlertsError(errorMessage(a.reason));
    }
    lastFetch.current = Date.now();
    setLoading(false);
  }, []);

  const applyLocation = useCallback(
    async (loc: SavedLocation) => {
      locationRef.current = loc;
      setLocation(loc);
      setLocationError(null);
      await storage.setLocation(loc);
      syncAlertScheduler(loc.latitude, loc.longitude, notificationsRef.current);
      await loadData(loc);
    },
    [loadData],
  );

  const locateWithGps = useCallback(async () => {
    setLocating(true);
    try {
      const coords = await locationService.getCurrentPosition();
      await applyLocation({...coords, mode: 'gps'});
    } catch (e: any) {
      setLocationError(e?.message || translate('errLocationShort'));
      // Keep showing data for the last known position.
      if (locationRef.current) {
        await loadData(locationRef.current);
      }
    } finally {
      setLocating(false);
    }
  }, [applyLocation, loadData]);

  // Startup: restore settings and the last location, then try GPS.
  useEffect(() => {
    (async () => {
      await initApiBaseUrl();
      const enabled = await storage.getNotificationsEnabled();
      notificationsRef.current = enabled;
      setNotifications(enabled);
      const saved = await storage.getLocation();
      if (saved) {
        locationRef.current = saved;
        setLocation(saved);
      }
      if (!saved || saved.mode === 'gps') {
        await locateWithGps();
      } else {
        setLocating(false);
        await applyLocation(saved);
      }
      if (enabled) {
        await requestNotificationPermission();
      }
    })();
  }, [applyLocation, locateWithGps]);

  // The API returns alerts and weather texts in the app's language: reload them when the user
  // switches language, and tell the background checker.
  const {lang} = useI18n();
  const firstLang = useRef(lang);
  useEffect(() => {
    const loc = locationRef.current;
    if (lang === firstLang.current || !loc) {
      return;
    }
    firstLang.current = lang;
    syncAlertScheduler(loc.latitude, loc.longitude, notificationsRef.current);
    loadData(loc);
  }, [lang, loadData]);

  // Refresh when the app comes back to the foreground after a while.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const loc = locationRef.current;
      if (state === 'active' && loc && Date.now() - lastFetch.current > REFRESH_AFTER_MS) {
        if (loc.mode === 'gps') {
          locateWithGps();
        } else {
          loadData(loc);
        }
      }
    });
    return () => sub.remove();
  }, [loadData, locateWithGps]);

  const refresh = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc || loc.mode === 'gps') {
      await locateWithGps();
    } else {
      await loadData(loc);
    }
  }, [loadData, locateWithGps]);

  const setManualLocation = useCallback(
    async (place: {name: string; latitude: number; longitude: number}) => {
      await applyLocation({
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
        mode: 'manual',
      });
    },
    [applyLocation],
  );

  const setNotificationsEnabled = useCallback(async (on: boolean) => {
    if (on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        on = false;
      }
    }
    notificationsRef.current = on;
    setNotifications(on);
    await storage.setNotificationsEnabled(on);
    const loc = locationRef.current;
    if (loc) {
      syncAlertScheduler(loc.latitude, loc.longitude, on);
    }
  }, []);

  const value = useMemo(
    () => ({
      location,
      locationError,
      locating,
      weather,
      weatherError,
      alerts,
      alertsError,
      loading,
      notificationsEnabled,
      refresh,
      switchToGps: locateWithGps,
      setManualLocation,
      setNotificationsEnabled,
    }),
    [
      location,
      locationError,
      locating,
      weather,
      weatherError,
      alerts,
      alertsError,
      loading,
      notificationsEnabled,
      refresh,
      locateWithGps,
      setManualLocation,
      setNotificationsEnabled,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

/** Display name for the current location. */
export function locationLabel(
  location: SavedLocation | null,
  weather: WeatherData | null,
) {
  if (location?.mode === 'manual' && location.name) {
    // Built-in cities have a name in each language.
    const city = DEFAULT_LOCATIONS.find(c => c.name === location.name || c.nameEn === location.name);
    if (city) {
      return getLanguage() === 'en' ? city.nameEn : city.name;
    }
    return location.name;
  }
  return weather?.location.display || weather?.location.name || translate('yourLocation');
}
