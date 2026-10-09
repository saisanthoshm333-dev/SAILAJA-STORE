# SAILAJA STORE deployment

The Android app is a Capacitor WebView for the existing Express application. Express, MongoDB, PDF generation, and WhatsApp notifications remain on the server; Android loads the deployed HTTPS site.

## Deploy the backend to Render

1. Create a MongoDB Atlas database user (separate from your Atlas website login), create/select the `sailaja_store` database, and copy the Atlas **Drivers** connection string. Replace `<db_username>` and `<db_password>` with the database user's credentials. Percent-encode special characters in the username or password before inserting them in the URI.
2. In Atlas **Network Access**, allow the outbound IP addresses shown for your Render service. Avoid allowing all IP addresses unless you deliberately accept that exposure.
3. In Render, create a Blueprint from this repository and apply `render.yaml`.
4. Set the requested `MONGODB_URI` secret to the completed Atlas URI. Keep the WhatsApp session disk enabled; it preserves the linked WhatsApp Web session across restarts and deploys.
5. The Render build downloads the Puppeteer-managed Chrome version required by the locked Puppeteer version and verifies it can run. On the first server start, scan the WhatsApp QR code printed in the Render service logs with the dedicated store account. The service starts Chrome in headless mode on Render.
6. Wait for the Render health check at `/health` to pass, then copy the assigned HTTPS service origin. No URL is baked into the project.

The server does not start accepting requests until MongoDB connects. A failed Atlas connection is reported at startup rather than allowing the app to run in a disconnected state.

## Connect a local development server to Atlas

In PowerShell, create your ignored local environment file and edit its `MONGODB_URI` with the real Atlas connection string:

```powershell
Copy-Item .env.example .env
notepad .env
npm start
```

The `.env` file is ignored by Git. Do not paste Atlas credentials into `.env.example` or commit them. Check `/health` locally after startup; a successful response reports `"database": "connected"`.

The Render service uses a paid instance because persistent disks are required for the WhatsApp login session. Puppeteer's browser cache is kept under `/opt/render/project/src/.cache/puppeteer` during the build and is not downloaded again on each server start. WhatsApp Web automation is provided by the existing unofficial WBM integration and may need maintenance if WhatsApp changes its web client.

## Prepare and build the Android app

Install Node.js 22 or later, Java 21, and the Android SDK (Android Studio installs the required SDK/build tools). From PowerShell, set the HTTPS origin assigned by Render for the current terminal session:

```powershell
$env:CAPACITOR_SERVER_URL = Read-Host "Paste the HTTPS origin assigned by Render"
```

The Android sync/build scripts reject a missing or non-HTTPS URL; they do not generate a production APK pointed at a placeholder.

Generate the native Android project once:

```powershell
npm ci
npm run android:add
```

Build a debug APK:

```powershell
npm run android:build
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Subsequent URL changes require setting the updated `CAPACITOR_SERVER_URL` and rebuilding. Use Android Studio's signed bundle/APK workflow for a release build.

The Android project can be generated before deployment, but syncing and building it require the real Render URL so that the installed app always loads the configured production site.
