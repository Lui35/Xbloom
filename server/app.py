import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

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


class BeanProfile(BaseModel):
    brew_style: Literal["hot", "iced", "cold"]
    brewer: str = Field(min_length=1, max_length=60)
    dose: float = Field(ge=5, le=30)
    target_water: int = Field(ge=30, le=500)
    country: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=100)
    producer: str | None = Field(default=None, max_length=100)
    species: str | None = Field(default=None, max_length=50)
    variety: str | None = Field(default=None, max_length=100)
    process: str | None = Field(default=None, max_length=100)
    altitude_masl: int | None = Field(default=None, ge=0, le=3000)
    roast_level: str | None = Field(default=None, max_length=50)
    roast_date: str | None = Field(default=None, max_length=30)
    tasting_notes: str | None = Field(default=None, max_length=300)
    desired_cup: str | None = Field(default=None, max_length=400)


class AIRecipePour(BaseModel):
    volume: int = Field(ge=0, le=100)
    temp: int = Field(ge=80, le=96)
    flow: float = Field(ge=3.0, le=3.5)
    pauseAfter: int = Field(ge=0, le=60)
    pattern: Literal["center", "circular", "spiral"]
    agitationBefore: bool
    agitationAfter: bool


class AIRecipeResult(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    rationale: str = Field(min_length=1, max_length=500)
    grind: int = Field(ge=1, le=80)
    rpm: Literal[60, 70, 80, 90, 100, 110, 120]
    dose: float = Field(ge=5, le=30)
    pours: list[AIRecipePour] = Field(min_length=1, max_length=8)


class EnhanceRecipeRequest(BaseModel):
    bean: BeanProfile | None = None
    recipe: dict[str, Any]
    feedback: str = Field(min_length=3, max_length=1000)
    rating: int | None = Field(default=None, ge=1, le=5)


async def ask_gemini(prompt: str) -> AIRecipeResult:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(503, "Gemini is not configured. Add GEMINI_API_KEY to .env and restart the backend.")
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35,
            "responseMimeType": "application/json",
            "responseJsonSchema": AIRecipeResult.model_json_schema(),
        },
    }
    try:
        async with httpx.AsyncClient(timeout=45) as session:
            response = None
            models = [os.getenv("GEMINI_MODEL", "gemini-3.5-flash"), os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")]
            for model in dict.fromkeys(models):
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                response = await session.post(url, headers={"x-goog-api-key": api_key}, json=body)
                if response.status_code not in (429, 503):
                    break
        assert response is not None
        if response.status_code >= 400:
            detail = response.json().get("error", {}).get("message", "Gemini request failed")
            raise HTTPException(502, detail)
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        result = AIRecipeResult.model_validate_json(text)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, f"Gemini returned an invalid recipe: {error}") from error
    total = sum(p.volume for p in result.pours)
    if total > 500:
        raise HTTPException(502, "The AI recipe exceeded the machine's 500 ml safety limit.")
    return result


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
    return {"ok": True, "pybloom": str(PYBLOOM_SRC), "aiConfigured": bool(os.getenv("GEMINI_API_KEY"))}


@app.post("/api/ai/generate-recipe", response_model=AIRecipeResult)
async def generate_ai_recipe(profile: BeanProfile):
    prompt = f"""You are an expert specialty-coffee recipe designer for an xBloom Studio.
Create one practical recipe from the bean profile below.
Return only the requested JSON schema. Respect every numeric schema limit.
The sum of pour volumes should be close to target_water and never exceed 500 ml.
Each individual pour is limited to 100 ml, so use additional pours when needed.
Use 1-8 pours. Temperatures are Celsius. Flow is ml/s.
For iced coffee, describe only hot water delivered by the machine; account for ice by reducing target brew water.
For cold style, use the lowest supported temperature and explain the compromise in rationale.
Choose agitation conservatively. Keep the rationale concise and specific to the coffee.

Bean profile:
{profile.model_dump_json(exclude_none=True)}"""
    return await ask_gemini(prompt)


@app.post("/api/ai/enhance-recipe", response_model=AIRecipeResult)
async def enhance_ai_recipe(request: EnhanceRecipeRequest):
    prompt = f"""You are an expert specialty-coffee dial-in assistant for an xBloom Studio.
Create an improved COPY of the recipe based on the user's taste feedback.
Return only the requested JSON schema. Respect every numeric schema limit.
Never exceed 500 ml total, 100 ml per pour, or 8 pours.
Make restrained, explainable changes rather than changing everything at once.
The new name must distinguish this version from the original.

Original recipe:
{request.recipe}

Bean profile (may be absent):
{request.bean.model_dump_json(exclude_none=True) if request.bean else "Not provided"}

Rating: {request.rating or "Not provided"}/5
Taste feedback: {request.feedback}"""
    return await ask_gemini(prompt)


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
