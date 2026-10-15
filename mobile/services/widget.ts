import AlertScheduler from '../specs/NativeAlertScheduler';
import type {Alert, Severity, WeatherData, WeatherIcon} from './model';

/**
 * What the home-screen widget shows (Android: android/.../widget/WidgetStore.kt reads this JSON).
 * A part that didn't load is null, and the widget keeps what it had; `alerts` null means "not
 * known", never "no alerts".
 */
export interface WidgetSnapshot {
  place: string | null;
  temperature: number | null;
  condition: string | null;
  icon: WeatherIcon | null;
  is_day: boolean;
  alerts: {title: string; severity: Severity}[] | null;
  /** When the alerts were checked, in ms since 1970. */
  checked_at: number;
}

export function widgetSnapshot(
  place: string | null,
  weather: WeatherData | null,
  alerts: Alert[] | null,
  now: number,
): WidgetSnapshot {
  return {
    place,
    temperature: weather?.current.temperature ?? null,
    condition: weather?.current.condition ?? null,
    icon: weather?.current.icon ?? null,
    is_day: weather?.current.is_day ?? true,
    alerts: alerts ? alerts.map(a => ({title: a.title, severity: a.severity})) : null,
    checked_at: alerts ? now : 0,
  };
}

/** Hands what the app just loaded to the widget, which then redraws. */
export function updateWidget(snapshot: WidgetSnapshot) {
  AlertScheduler?.setWidget(JSON.stringify(snapshot));
}
