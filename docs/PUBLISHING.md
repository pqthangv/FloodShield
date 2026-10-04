# Publishing on Google Play

1. **Developer account:** [play.google.com/console](https://play.google.com/console), US$25 one-time,
   identity verification. New *personal* accounts must run a **closed test with at least 12 testers
   for 14 days** before they can publish to everyone - start this early.
2. **Choose the final app id** (it cannot change after the first upload). It is currently
   `com.pqt_mobile` in `mobile/android/app/build.gradle` (`applicationId`).
3. **Create the upload key** (once, then back up both files it creates):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\create-upload-key.ps1
   ```
4. **Build the bundle:** deploy the API and set `PROD_API_URL` (see [SETUP.md](SETUP.md#4-put-the-api-online)),
   bump `versionCode` in `mobile/android/app/build.gradle` for every upload, then
   ```powershell
   cd mobile
   npm run build:aab
   ```
   Upload `mobile/android/app/build/outputs/bundle/release/app-release.aab` and keep *Play App
   Signing* (the default).
5. **Store listing:** name, short/long description (Vietnamese), icon 512×512, feature graphic
   1024×500, at least 2 phone screenshots. State clearly that the app is **not affiliated with the
   government** and that users should follow official instructions.
6. **App content forms:**
   - Privacy policy URL: `https://<api>/privacy` (served by the backend).
   - Data safety - data collected: *Location (approximate & precise)* - app functionality;
     *Photos*, *Name* (display name), *Other user-generated content* - user-provided, shown
     publicly; *Device or other IDs* (random app id) - app functionality, fraud prevention.
     Not shared with third parties, encrypted in transit (HTTPS), users can delete their data in
     the app (*Cài đặt → Xóa dữ liệu của tôi*). No account creation.
   - Content rating: answer **yes** to "users can share content / interact".
   - Target audience: 13+ (not designed for children).
   - User-generated content: report, block (hide author), rules acceptance and moderation are built in.
   - The app requests no background location and no photo/storage permission (it uses the system
     Photo Picker and camera app), which keeps the review simple.

Before going live, test the release build on a real phone: `npm run build:apk`, then
`adb install android\app\build\outputs\apk\release\app-release.apk`.
