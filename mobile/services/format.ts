import {Severity, WeatherIcon} from './model';

const WEEKDAYS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** Parses "2026-10-04" or "2026-10-04T15:00" as local time. */
export function parseLocal(value: string): Date {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function weekdayVi(date: Date) {
  return WEEKDAYS[date.getDay()];
}

export function shortDate(value: string) {
  const d = parseLocal(value);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function longDateVi(date: Date = new Date()) {
  return `Ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
}

export function timeOf(value: string) {
  return value.split('T')[1]?.slice(0, 5) ?? '';
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) {
    return 'Vừa xong';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} phút trước`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} giờ trước`;
  }
  return `${Math.floor(hours / 24)} ngày trước`;
}

export function formatDistance(km: number | null | undefined) {
  if (km === null || km === undefined) {
    return '';
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Theo dõi',
  moderate: 'Cảnh báo',
  high: 'Nguy hiểm',
  severe: 'Rất nguy hiểm',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: '#4A90D9',
  moderate: '#FFA500',
  high: '#F4511E',
  severe: '#D50000',
};

export const SEVERITY_LEVEL: Record<Severity, string> = {
  info: '01',
  moderate: '02',
  high: '03',
  severe: '04',
};

const WEATHER_IMAGES: Record<WeatherIcon, any> = {
  clear: require('../assets/predict/sunAndCloud.png'),
  cloudy: require('../assets/predict/sunAndCloud.png'),
  drizzle: require('../assets/predict/sunAndRain.png'),
  rain: require('../assets/predict/rain.png'),
  thunderstorm: require('../assets/predict/sunAndThunder.png'),
  snow: require('../assets/predict/snow.png'),
};

export const weatherImage = (icon: WeatherIcon | undefined) =>
  WEATHER_IMAGES[icon || 'cloudy'] ?? WEATHER_IMAGES.cloudy;
