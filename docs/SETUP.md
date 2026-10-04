# Running FloodShield locally and deploying the API

## 1. One-time setup (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-dev-windows.ps1
```

Installs, without admin rights, Node.js 24, JDK 17, the Android SDK and an Android 16 emulator
(`FloodShield_Pixel`). **Open a new terminal / restart VS Code afterwards** so the PATH is updated.

On macOS/Linux, install Node.js ≥ 22.11, JDK 17, Python ≥ 3.12 and Android Studio, then follow the
step-by-step commands below.

## 2. Run everything

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
```

That opens the API (http://localhost:8000, interactive docs at http://localhost:8000/docs) and
Metro in two windows, boots the emulator, then builds and installs the app.

Or step by step, in three terminals:

```powershell
# 1. API
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Metro (JS server)
cd mobile
npm install
npx react-native start

# 3. App on the emulator or a USB phone
cd mobile
npm run android          # also runs: adb reverse tcp:8000 tcp:8000
```

**Real phone:** enable *Developer options → USB debugging*, plug it in, accept the prompt, then
`npm run android`. `adb reverse` lets the phone reach your PC's API at `localhost:8000`.
After unplugging/replugging, run `npm run api-tunnel` again.

**Emulator GPS:** emulator window → `…` → *Location*, or `adb emu geo fix 106.7009 10.7769`
(longitude first). You can also pick any place in the app (tap the location under the temperature).

## 3. Tests

```powershell
cd backend; .venv\Scripts\python -m pytest            # 16 tests, no network needed
cd mobile;  npm test; npm run typecheck; npm run lint
```

The same checks run on GitHub Actions for every push (`.github/workflows/ci.yml`).

## 4. Put the API online

The app on people's phones needs the API on the internet with **HTTPS**. A free setup that keeps
all data (photos are stored in the database):

1. **Database:** create a free PostgreSQL database on [neon.tech](https://neon.tech) and copy the
   connection string (`postgresql://…`).
2. **API:** on [render.com](https://render.com) → *New Web Service* → this repository → root
   directory `backend` → *Docker*. Environment variables:
   - `DATABASE_URL` = the Neon connection string
   - `ADMIN_TOKEN` = a long random string (enables the admin endpoints)
   - `PUBLIC_BASE_URL` = `https://<your-service>.onrender.com`
   - `CONTACT_EMAIL` = a contact address (shown in the privacy policy; required by OpenStreetMap's usage policy)
3. Check `https://<your-service>.onrender.com/health` and `/privacy`.
4. In `mobile/config.ts` set `PROD_API_URL = 'https://<your-service>.onrender.com/api/v1'`.

Free Render services sleep after 15 minutes idle; the first request then takes ~1 minute (the app
waits up to 60 s). A paid plan (~$7/month) avoids that, which matters for a disaster app.
`docker compose up --build` (in `backend/`) runs the same API + PostgreSQL locally.

**Admin tasks** (issue an official warning, add an official shelter, moderate posts): open
`https://<api>/docs`, open an `admin` endpoint, *Try it out*, and put your `ADMIN_TOKEN` in the
`x-admin-token` field. For example, `POST /api/v1/admin/alerts` with a centre point and radius
reaches every phone in that radius, in the app and as a notification.

**Quotas:** Open-Meteo's free tier is 10,000 calls/day and *non-commercial*. The API caches
everything (weather 15 min, river data 3 h, flood levels stored in the DB) and analyses at most 10
new rivers per day. If you add ads or charge money, buy an Open-Meteo API plan.
