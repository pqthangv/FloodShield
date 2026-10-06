import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {I18nManager} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import vi from './vi';
import en from './en';

export type Language = 'vi' | 'en';
export type MessageKey = keyof typeof vi;
type Params = Record<string, string | number>;

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = {vi, en};
const STORAGE_KEY = 'language';

/** Phone language: Vietnamese phones get Vietnamese, everything else English. */
export function deviceLanguage(): Language {
  try {
    const id =
      I18nManager.getConstants?.().localeIdentifier ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      'vi';
    return id.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    return 'vi';
  }
}

let current: Language = deviceLanguage();

/** Current language, for code outside React components (API client, services). */
export const getLanguage = () => current;

/** Used by tests to pin a language. */
export const setLanguageForTests = (lang: Language) => {
  current = lang;
};

/** Translate a key; {placeholders} are replaced by params. */
export function translate(key: MessageKey, params?: Params): string {
  let text = DICTIONARIES[current][key] ?? vi[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

interface I18nValue {
  lang: Language;
  t: typeof translate;
  setLanguage: (lang: Language) => Promise<void>;
}

const I18nContext = createContext<I18nValue>({
  lang: current,
  t: translate,
  setLanguage: async () => {},
});

export const useI18n = () => useContext(I18nContext);

export const I18nProvider = ({children}: {children: React.ReactNode}) => {
  const [lang, setLang] = useState<Language>(current);
  const [ready, setReady] = useState(false);

  // Load the language chosen in Settings before showing anything, so the first screen and the
  // first API requests already use it.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved === 'vi' || saved === 'en') {
          current = saved;
          setLang(saved);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback(async (next: Language) => {
    current = next;
    setLang(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  // A new `t` per language makes every screen using it re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key: MessageKey, params?: Params) => translate(key, params), [lang]);
  const value = useMemo(() => ({lang, t, setLanguage}), [lang, t, setLanguage]);

  return ready ? <I18nContext.Provider value={value}>{children}</I18nContext.Provider> : null;
};
