import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PYBLOOM_SRC = Path(__file__).resolve().parents[2] / "PyBloom" / "src"
if not PYBLOOM_SRC.exists():
    raise RuntimeError(f"PyBloom was not found at {PYBLOOM_SRC}")
sys.path.insert(0, str(PYBLOOM_SRC))

from xbloom import XBloomClient
from xbloom.models.types import CupType, PourPattern, PourStep, VibrationPattern, XBloomRecipe
from xbloom.scanner import discover_devices

client: XBloomClient | None = None
device_address: str | None = None
operation_lock = asyncio.Lock()


class ConnectRequest(BaseModel):
    address: str | None = None


class PourInput(BaseModel):
    volume: int = Field(ge=0, le=100)
    temperature: int = Field(ge=80, le=96)
    pause_before: int = Field(default=0, ge=0, le=120)
    pause_after: int = Field(default=0, ge=0, le=120)
    flow_rate: float = Field(ge=3.0, le=3.5)
    pattern: Literal["center", "circular", "spiral"] = "spiral"
    agitation_before: bool = False
    agitation_after: bool = False


class BrewRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    use_grinder: bool = True
    grind_size: int = Field(ge=1, le=80)
    rpm: Literal[60, 70, 80, 90, 100, 110, 120] = 80
    bean_weight: float = Field(ge=5, le=30)
    pours: list[PourInput] = Field(min_length=1, max_length=8)
    confirmed: bool = False


def status_payload():
    if not client:
        return {"connected": False, "address": device_address, "state": "offline"}
    status = client.status
    state_value = getattr(status.state, "value", str(status.state))
    has_machine_telemetry = status.brewer.temperature > 0 or status.water_volume > 0 or state_value != "unknown"
    return {
        "connected": client.is_connected,
        "address": device_address,
        "state": state_value,
        "weight": round(status.scale.weight, 2),
        "temperature": round(status.brewer.temperature, 1),
        "waterLevelOk": status.water_level_ok if has_machine_telemetry else None,
        "waterVolume": status.water_volume,
        "grinderRunning": status.grinder.is_running,
        "brewerRunning": status.brewer.is_running,
        "model": status.model or "xBloom Studio",
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    if client and client.is_connected:
        client._cleanup_on_disconnect = False
        await client.disconnect()


app = FastAPI(title="xBloom Local", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
async def health():
    return {"ok": True, "pybloom": str(PYBLOOM_SRC)}


@app.get("/api/devices")
async def devices():
    found = await discover_devices(timeout=7)
    return [{"name": d.name or "xBloom", "address": d.address} for d in found]


@app.post("/api/connect")
async def connect(request: ConnectRequest):
    global client, device_address
    address = request.address
    if not address:
        found = await discover_devices(timeout=7)
        if not found:
            raise HTTPException(404, "No xBloom machine found. Make sure it is on and disconnect the phone app.")
        address = found[0].address
    if client and client.is_connected:
        return status_payload()
    device_address = address
    client = XBloomClient(address)
    client._cleanup_on_disconnect = False
    if not await client.connect(timeout=20):
        client = None
        raise HTTPException(503, "The xBloom was found but the Bluetooth connection failed.")
    return status_payload()


@app.post("/api/disconnect")
async def disconnect():
    global client
    if client and client.is_connected:
        client._cleanup_on_disconnect = False
        await client.disconnect()
    client = None
    return {"connected": False, "state": "offline"}


@app.get("/api/status")
async def get_status():
    return status_payload()


@app.post("/api/brew")
async def brew(request: BrewRequest):
    if not request.confirmed:
        raise HTTPException(400, "Physical brew confirmation is required.")
    if not client or not client.is_connected:
        raise HTTPException(409, "Connect to the xBloom first.")
    # The device can keep its previous low-water bit until the next operation.
    # Let a confirmed brew reach the machine so it can recheck a newly filled tank;
    # the xBloom firmware still prevents operation if water is genuinely too low.
    if operation_lock.locked():
        raise HTTPException(409, "The machine is already running an operation.")
    pattern_map = {"center": PourPattern.CENTER, "circular": PourPattern.CIRCULAR, "spiral": PourPattern.SPIRAL}
    vibration_map = {(False, False): VibrationPattern.NONE, (True, False): VibrationPattern.BEFORE, (False, True): VibrationPattern.AFTER, (True, True): VibrationPattern.BOTH}
    total = sum(p.volume for p in request.pours)
    if total > 500:
        raise HTTPException(400, "Total water cannot exceed 500 ml.")
    recipe = XBloomRecipe(
        name=request.name, grind_size=request.grind_size, rpm=request.rpm,
        bean_weight=request.bean_weight, total_water=round(total / 10), cup_type=CupType.OMNI_DRIPPER,
        pours=[PourStep(volume=p.volume, temperature=p.temperature, pausing=min(255, p.pause_after + (request.pours[i + 1].pause_before if i + 1 < len(request.pours) else 0)), flow_rate=p.flow_rate, pattern=pattern_map[p.pattern], vibration=vibration_map[(p.agitation_before, p.agitation_after)]) for i, p in enumerate(request.pours)],
    )
    async with operation_lock:
        if request.use_grinder:
            await client.brew(recipe, wait_for_completion=False)
        else:
            await client.brew_without_grinding(recipe, wait_for_completion=False)
    return {"started": True, "recipe": request.name}


@app.post("/api/stop")
async def stop():
    if not client or not client.is_connected:
        raise HTTPException(409, "The machine is not connected.")
    await client.stop_recipe()
    return {"stopped": True}
