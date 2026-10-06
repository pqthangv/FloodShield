# FloodShield - Android app (React Native 0.87)

See the main guide in [../README.md](../README.md) for setup, running, deploying and publishing.

Quick start (with the API running on port 8000):

```sh
npx react-native start      # terminal 1
npm run android             # terminal 2 (also forwards port 8000 to the phone/emulator)
```

Code map:

| Path | What |
|---|---|
| `App.tsx` | navigation (4 tabs + stack screens) |
| `config.ts` | API URLs (set `PROD_API_URL` before a release build) |
| `context/AppContext.tsx` | location, weather and alerts shared by all screens |
| `apis/disasterAPI.ts` | all API calls |
| `views/`, `components/` | screens |
| `specs/NativeAlertScheduler.ts` + `android/app/src/main/java/com/floodshield/app/alerts/` | background alert checks & notifications |
| `i18n/` (`vi.ts`, `en.ts`, `useI18n()`) | Vietnamese and English texts; screens call `t('key')` |
