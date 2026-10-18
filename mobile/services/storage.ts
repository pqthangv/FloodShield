import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  deviceId: 'deviceId',
  nickname: 'nickname',
  location: 'location',
  notifications: 'notificationsEnabled',
  blockedAuthors: 'blockedAuthors',
  rulesAccepted: 'communityRulesAccepted',
  apiUrl: 'apiUrlOverride',
  welcomeSeen: 'welcomeSeen',
  widgetTest: 'widgetTest',
  checklist: (typeId: number) => `checklist:${typeId}`,
};

export interface SavedLocation {
  latitude: number;
  longitude: number;
  name?: string;
  // 'gps' follows the phone's position, 'manual' is a place the user picked.
  mode: 'gps' | 'manual';
}

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON(key: string, value: unknown) {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

function randomId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}

let cachedDeviceId: string | null = null;

const storage = {
  /** Random id created on first launch; lets users manage their own posts without an account. */
  async getDeviceId(): Promise<string> {
    if (cachedDeviceId) {
      return cachedDeviceId;
    }
    let id = await AsyncStorage.getItem(KEYS.deviceId);
    if (!id) {
      id = randomId();
      await AsyncStorage.setItem(KEYS.deviceId, id);
    }
    cachedDeviceId = id;
    return id;
  },

  getNickname: () => AsyncStorage.getItem(KEYS.nickname),
  setNickname: (name: string) => AsyncStorage.setItem(KEYS.nickname, name),

  getLocation: () => getJSON<SavedLocation | null>(KEYS.location, null),
  setLocation: (loc: SavedLocation) => setJSON(KEYS.location, loc),

  getNotificationsEnabled: () => getJSON<boolean>(KEYS.notifications, true),
  setNotificationsEnabled: (on: boolean) => setJSON(KEYS.notifications, on),

  getBlockedAuthors: () => getJSON<string[]>(KEYS.blockedAuthors, []),
  setBlockedAuthors: (ids: string[]) => setJSON(KEYS.blockedAuthors, ids),

  getRulesAccepted: () => getJSON<boolean>(KEYS.rulesAccepted, false),
  setRulesAccepted: () => setJSON(KEYS.rulesAccepted, true),

  getApiUrl: () => AsyncStorage.getItem(KEYS.apiUrl),
  setApiUrl: (url: string | null) =>
    url
      ? AsyncStorage.setItem(KEYS.apiUrl, url)
      : AsyncStorage.removeItem(KEYS.apiUrl),

  /** The first-launch tour is shown once. Someone with a saved place used the app before it. */
  async getWelcomeSeen(): Promise<boolean> {
    return (
      (await getJSON<boolean>(KEYS.welcomeSeen, false)) ||
      (await AsyncStorage.getItem(KEYS.location)) !== null
    );
  },
  setWelcomeSeen: () => setJSON(KEYS.welcomeSeen, true),

  getWidgetTest: () => getJSON<boolean>(KEYS.widgetTest, false),
  setWidgetTest: (on: boolean) => setJSON(KEYS.widgetTest, on),

  getChecklist: (typeId: number) =>
    getJSON<number[]>(KEYS.checklist(typeId), []),
  setChecklist: (typeId: number, doneIds: number[]) =>
    setJSON(KEYS.checklist(typeId), doneIds),
};

export default storage;
