# xBloom Desktop

A cross-platform Electron companion for xBloom machines. The current prototype includes real BLE discovery, live weight/temperature/status telemetry, recipe selection, simulated brew progress, machine status, and recent brew information.

## Run locally

```bash
cd C:\Users\luich\Projects\PyBloom
.\.venv\Scripts\Activate.ps1
pip install -e .
pip install -r ..\xBloom\server\requirements.txt

cd ..\xBloom
npm install
npm run dev
```

## Create an installer

```bash
npm run package
```

## Run with Docker Compose

Copy `.env.example` to `.env`, add your Gemini key if you use AI recipes, then run:

```bash
docker compose up --build
```

Open `http://127.0.0.1:5173`. The API is available at
`http://127.0.0.1:8766`.

Docker Desktop cannot pass the Windows Bluetooth adapter directly into its Linux
containers. This project uses a small authenticated Windows bridge for physical
machine control while keeping the web app, AI, and SQLite API in Docker.

Start the bridge in one PowerShell terminal and leave it open:

```powershell
npm run bluetooth:bridge
```

Then start the complete Docker app in another terminal:

```powershell
docker compose up --build
```

The browser continues to call the container API on port `8766`. AI and data calls
stay inside that API; device discovery, connect, status, brew, stop, disconnect,
and the Windows Bluetooth settings shortcut are forwarded to the native bridge
on port `8767` through `host.docker.internal`.

Set the same `XBLOOM_BRIDGE_TOKEN` in `.env` for both processes. The bridge
rejects unauthenticated device requests. Port `8767` is not intended for remote
access and should remain protected by Windows Firewall.

## Library backups and coffee-label scanning

Use **Settings → Recipe and bean library** to export or import a JSON backup.
Imports merge into the existing library and receive new local IDs, so they do
not overwrite existing entries.

On **Beans**, choose **Scan package** to send up to two JPEG, PNG, or WebP label
images to the configured Gemini model. The processing card becomes a saved bean
card when extraction finishes; low-confidence fields are marked for review.
Images are limited to 10 MB each.

The local API now persists beans, recipes, package photos, inventory, and brew
history in SQLite (`xbloom.db` natively or `/app/data/xbloom.db` in Docker).
Browser storage remains a startup/offline fallback and is migrated into SQLite
the first time the upgraded app runs. Bean scans accept up to two photos (front
then back), include per-field AI confidence, and save directly to the bean shelf.

## Bluetooth support

For native development, the API at `127.0.0.1:8766` uses the adjacent PyBloom
clone directly. Under Docker Compose, the container API proxies only physical
device operations to the authenticated Windows bridge. Neither mode uses or
exposes MQTT.
