// Shapes of the FloodShield API responses (see backend/routers).

export type DissaterData = Dissater[];

export interface Dissater {
  id: number;
  name: string;
  actions: Action[];
}

export interface Action {
  action_id: number;
  thien_tai_id: number;
  title: string;
  description: string;
}

export type WeatherIcon =
  | 'clear'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'thunderstorm'
  | 'snow';

export interface WeatherData {
  timezone: string;
  utc_offset_seconds: number;
  location: {
    latitude: number;
    longitude: number;
    name: string;
    region: string | null;
    display: string | null;
  };
  current: {
    time: string;
    temperature: number;
    apparent_temperature: number;
    humidity: number;
    precipitation: number;
    wind_speed: number;
    wind_gusts: number;
    condition: string;
    icon: WeatherIcon;
    is_day: boolean;
  };
  hourly: Array<{
    time: string;
    temperature: number;
    precipitation: number;
    precipitation_probability: number | null;
    wind_speed: number;
    condition: string;
    icon: WeatherIcon;
  }>;
  daily: Array<{
    date: string;
    temperature_max: number;
    temperature_min: number;
    precipitation_sum: number;
    precipitation_probability_max: number | null;
    wind_speed_max: number;
    wind_gusts_max: number;
    condition: string;
    icon: WeatherIcon;
    sunrise: string;
    sunset: string;
  }>;
  updated_at: string;
}

export type Severity = 'info' | 'moderate' | 'high' | 'severe';

export interface Alert {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  area: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  source: string;
  distance_km: number | null;
  details: {label: string; value: string}[];
  disaster_type_id: number | null;
  url: string | null;
}

export type FloodRisk =
  | 'none'
  | 'watch'
  | 'moderate'
  | 'high'
  | 'severe'
  | 'unknown';

export interface FloodOutlook {
  river: {
    latitude: number;
    longitude: number;
    distance_km: number;
    median_discharge: number;
  } | null;
  thresholds: {rp2: number; rp5: number; rp20: number; years: number} | null;
  forecast: Array<{
    date: string;
    discharge: number | null;
    discharge_low: number | null;
    discharge_high: number | null;
    is_forecast: boolean;
  }>;
  peak: {date: string; discharge: number} | null;
  risk: FloodRisk;
  risk_label: string;
  summary: string;
}

export interface Shelter {
  id: string;
  name: string;
  address: string | null;
  kind: string;
  kind_label: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  capacity: number | null;
  phone: string | null;
  note: string | null;
  official: boolean;
  source: string;
}

export type PostCategory = 'flood' | 'landslide' | 'storm' | 'rescue' | 'other';
export type WaterLevel =
  | 'none'
  | 'ankle'
  | 'knee'
  | 'waist'
  | 'chest'
  | 'over_head';

export interface Post {
  id: number;
  author_name: string;
  author_id: string;
  category: PostCategory;
  water_level: WaterLevel | null;
  description: string;
  latitude: number;
  longitude: number;
  address: string | null;
  image_url: string | null;
  created_at: string;
  confirm_count: number;
  distance_km: number | null;
  is_mine: boolean;
  confirmed_by_me: boolean;
}

export interface Place {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
}
