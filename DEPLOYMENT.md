# SAILAJA STORE deployment

The Android app is a Capacitor WebView for the existing Express application. Express, MongoDB, PDF generation, and WhatsApp notifications remain on the server; Android loads the deployed HTTPS site.

## Deploy the backend to Render

1. Create a MongoDB database that Render can reach and copy its connection URI.
2. In Render, create a Blueprint from this repository and apply `render.yaml`.
3. Set the requested `MONGODB_URI` secret to the database URI. Keep the WhatsApp session disk enabled; it preserves the linked WhatsApp Web session across restarts and deploys.
4. On the first server start, scan the WhatsApp QR code printed in the Render service logs with the dedicated store account. The service starts Chromium in headless mode on Render.
5. Wait for the Render health check at `/health` to pass, then copy the assigned HTTPS service origin. No URL is baked into the project.

The Render service uses a paid instance because persistent disks are required for the WhatsApp login session. WhatsApp Web automation is provided by the existing unofficial WBM integration and may need maintenance if WhatsApp changes its web client.

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
