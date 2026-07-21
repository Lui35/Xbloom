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

## Bluetooth support

The web UI runs locally at `http://127.0.0.1:5173`. A loopback-only API at `127.0.0.1:8766` uses the adjacent PyBloom clone for BLE discovery, telemetry, and validated brew execution. It does not use or expose MQTT.
