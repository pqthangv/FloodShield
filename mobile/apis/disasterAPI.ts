import axiosClient from '../services/axiosClient';
import {
  Alert,
  Dissater,
  DissaterData,
  FloodOutlook,
  Place,
  Post,
  PostCategory,
  Shelter,
  WaterLevel,
  WeatherData,
} from '../services/model';

/**
 * Sends the phone's own forecast when it has one. Falls back to letting the server fetch it when
 * the phone couldn't, or when the server rejects it or is an older version without the POST route.
 */
async function withForecast<T>(
  forecast: object | null | undefined,
  send: () => Promise<T>,
  serverFetches: () => Promise<T>,
): Promise<T> {
  if (!forecast) {
    return serverFetches();
  }
  try {
    return await send();
  } catch (e: any) {
    if ([404, 405, 422].includes(e?.response?.status)) {
      return serverFetches();
    }
    throw e;
  }
}

const disasterAPI = {
  getAll: async (): Promise<DissaterData> => {
    const url = '/thientai/';
    return axiosClient.get(url);
  },

  getById: async (id: number): Promise<Dissater> => {
    const url = `/thientai/${id}`;
    return axiosClient.get(url);
  },

  /** `forecast`: the raw Open-Meteo forecast the phone downloaded (see services/openMeteo.ts). */
  getWeather: async (lat: number, lon: number, forecast?: object | null): Promise<WeatherData> =>
    withForecast(
      forecast,
      () => axiosClient.post('/weather', {latitude: lat, longitude: lon, forecast}),
      () => axiosClient.get('/weather', {params: {lat, lon}}),
    ),

  getFlood: async (lat: number, lon: number): Promise<FloodOutlook> =>
    axiosClient.get('/flood', {params: {lat, lon}}),

  getAlerts: async (lat: number, lon: number, forecast?: object | null): Promise<{alerts: Alert[]}> =>
    withForecast(
      forecast,
      () => axiosClient.post('/alerts', {latitude: lat, longitude: lon, forecast}),
      () => axiosClient.get('/alerts', {params: {lat, lon}}),
    ),

  getShelters: async (lat: number, lon: number): Promise<{shelters: Shelter[]}> =>
    axiosClient.get('/shelters', {params: {lat, lon}}),

  searchPlaces: async (q: string): Promise<{results: Place[]}> =>
    axiosClient.get('/geocode/search', {params: {q}}),

  reverseGeocode: async (
    lat: number,
    lon: number,
  ): Promise<{name: string; region: string | null; display: string}> =>
    axiosClient.get('/geocode/reverse', {params: {lat, lon}}),
};

export interface NewPost {
  author_name: string;
  description: string;
  latitude: number;
  longitude: number;
  category: PostCategory;
  water_level?: WaterLevel | null;
  address?: string | null;
  image?: {uri: string; type?: string; fileName?: string} | null;
}

export const communityAPI = {
  getPosts: async (lat?: number, lon?: number): Promise<{posts: Post[]}> =>
    axiosClient.get('/posts', {params: {lat, lon, radius_km: 50}}),

  createPost: async (post: NewPost): Promise<Post> => {
    const form = new FormData();
    form.append('author_name', post.author_name);
    form.append('description', post.description);
    form.append('latitude', String(post.latitude));
    form.append('longitude', String(post.longitude));
    form.append('category', post.category);
    if (post.water_level) {
      form.append('water_level', post.water_level);
    }
    if (post.address) {
      form.append('address', post.address);
    }
    if (post.image) {
      form.append('image', {
        uri: post.image.uri,
        type: post.image.type || 'image/jpeg',
        name: post.image.fileName || 'photo.jpg',
      } as any);
    }
    return axiosClient.post('/posts', form, {
      headers: {'Content-Type': 'multipart/form-data'},
      transformRequest: data => data,
    });
  },

  confirm: async (
    id: number,
  ): Promise<{confirm_count: number; confirmed_by_me: boolean}> =>
    axiosClient.post(`/posts/${id}/confirm`),

  report: async (id: number, reason: string) =>
    axiosClient.post(`/posts/${id}/report`, {reason}),

  remove: async (id: number) => axiosClient.delete(`/posts/${id}`),

  deleteMyData: async (): Promise<{deleted_posts: number}> =>
    axiosClient.delete('/me'),
};

export default disasterAPI;
