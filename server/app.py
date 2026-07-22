import asyncio
import json
import math
import os
import sqlite3
import sys
import secrets
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

PYBLOOM_SRC = Path(
    os.getenv("PYBLOOM_SRC", str(Path(__file__).resolve().parents[2] / "PyBloom" / "src"))
)
if PYBLOOM_SRC.exists():
    sys.path.insert(0, str(PYBLOOM_SRC))

from xbloom import XBloomClient
from xbloom.models.types import CupType, PourPattern, PourStep, VibrationPattern, XBloomRecipe
from xbloom.scanner import discover_devices

DEVICE_CACHE_FILE = Path(os.getenv("XBLOOM_DEVICE_CACHE", PROJECT_ROOT / ".xbloom-device.json"))
DATABASE_FILE = Path(os.getenv("XBLOOM_DATABASE", PROJECT_ROOT / "xbloom.db"))
BLUETOOTH_BRIDGE_URL = os.getenv("XBLOOM_BLUETOOTH_BRIDGE_URL", "").rstrip("/")
BLUETOOTH_BRIDGE_TOKEN = os.getenv("XBLOOM_BRIDGE_TOKEN", "xbloom-local-bridge")
IS_BLUETOOTH_BRIDGE = os.getenv("XBLOOM_BRIDGE_SERVER", "") == "1"
GEMINI_MODELS = {
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
}


def selected_gemini_model(requested: str | None) -> str:
    model = requested or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    if model not in GEMINI_MODELS:
        raise HTTPException(400, "Unsupported Gemini model.")
    return model


async def forward_to_bluetooth_bridge(
    method: str, path: str, payload: dict[str, Any] | None = None
) -> Any:
    if not BLUETOOTH_BRIDGE_URL:
        return None
    headers = {"X-XBloom-Bridge-Token": BLUETOOTH_BRIDGE_TOKEN}
    try:
        async with httpx.AsyncClient(timeout=45) as session:
            response = await session.request(
                method, f"{BLUETOOTH_BRIDGE_URL}{path}", json=payload, headers=headers
            )
    except httpx.RequestError as error:
        raise HTTPException(
            503,
            "The Windows Bluetooth bridge is not running. Start it with npm run bluetooth:bridge.",
        ) from error
    if response.is_error:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(response.status_code, detail or "Bluetooth bridge request failed.")
    return response.json()


def initialize_database() -> None:
    DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATABASE_FILE)) as database:
        database.execute(
            "CREATE TABLE IF NOT EXISTS app_data (collection TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        database.commit()


def read_collection(name: str) -> list[Any]:
    with closing(sqlite3.connect(DATABASE_FILE)) as database:
        row = database.execute("SELECT payload FROM app_data WHERE collection = ?", (name,)).fetchone()
    return json.loads(row[0]) if row else []


def write_collection(name: str, value: list[Any]) -> None:
    with closing(sqlite3.connect(DATABASE_FILE)) as database:
        database.execute(
            "INSERT INTO app_data(collection, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(collection) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP",
            (name, json.dumps(value)),
        )
        database.commit()


def load_cached_address() -> str | None:
    try:
        return str(json.loads(DEVICE_CACHE_FILE.read_text(encoding="utf-8"))["address"])
    except (OSError, KeyError, TypeError, ValueError):
        return None


def save_cached_address(address: str) -> None:
    DEVICE_CACHE_FILE.write_text(json.dumps({"address": address}), encoding="utf-8")


client: XBloomClient | None = None
device_address: str | None = load_cached_address()
operation_lock = asyncio.Lock()


class ConnectRequest(BaseModel):
    address: str | None = None


class PourInput(BaseModel):
    volume: int = Field(ge=0, le=240)
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
    cups: int = Field(default=1, ge=1, le=3)
    brewer: str = Field(min_length=1, max_length=60)
    dose: float | None = Field(default=None, ge=5, le=30)
    target_water: int | None = Field(default=None, ge=30, le=500)
    country: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=100)
    producer: str | None = Field(default=None, max_length=100)
    species: str | None = Field(default=None, max_length=50)
    variety: str | None = Field(default=None, max_length=100)
    process: str | None = Field(default=None, max_length=100)
    bean_size: str | None = Field(default=None, max_length=80)
    acidity: int | None = Field(default=None, ge=1, le=5)
    process_detail: str | None = Field(default=None, max_length=200)
    infused_with: str | None = Field(default=None, max_length=150)
    altitude_masl: int | None = Field(default=None, ge=0, le=3000)
    roast_level: str | None = Field(default=None, max_length=50)
    roast_date: str | None = Field(default=None, max_length=30)
    tasting_notes: str | None = Field(default=None, max_length=300)
    desired_cup: str | None = Field(default=None, max_length=400)
    recipe_goals: list[str] = Field(default_factory=list, max_length=6)
    ai_choose_goals: bool = True
    user_preferences: list[str] = Field(default_factory=list, max_length=6)


class AIRecipePour(BaseModel):
    volume: int = Field(ge=0, le=240)
    temp: int = Field(ge=80, le=96)
    flow: float = Field(ge=3.0, le=3.5)
    pauseAfter: int = Field(ge=0, le=60)
    pattern: Literal["center", "circular", "spiral"]
    agitationBefore: bool
    agitationAfter: bool


class AIRecipeResult(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    rationale: str = Field(min_length=1, max_length=500)
    brew_style: Literal["hot", "iced", "cold"]
    ice_grams: int = Field(default=0, ge=0, le=500)
    grind: int = Field(ge=1, le=80)
    rpm: Literal[60, 70, 80, 90, 100, 110, 120]
    dose: float = Field(ge=5, le=30)
    pours: list[AIRecipePour] = Field(min_length=1, max_length=8)


class EnhanceRecipeRequest(BaseModel):
    bean: BeanProfile | None = None
    recipe: dict[str, Any]
    feedback: str = Field(min_length=3, max_length=1000)
    rating: int | None = Field(default=None, ge=1, le=5)


class BeanPhotoRequest(BaseModel):
    images: list[dict[str, str]] = Field(min_length=1, max_length=2)


class BeanPhotoResult(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    roaster: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=100)
    producer: str | None = Field(default=None, max_length=100)
    species: str | None = Field(default=None, max_length=50)
    variety: str | None = Field(default=None, max_length=100)
    process: str | None = Field(default=None, max_length=100)
    bean_size: str | None = Field(default=None, max_length=80)
    acidity: int | None = Field(default=None, ge=1, le=5)
    process_detail: str | None = Field(default=None, max_length=200)
    altitude_masl: int | None = Field(default=None, ge=0, le=3000)
    roast_level: str | None = Field(default=None, max_length=50)
    roast_date: str | None = Field(default=None, max_length=30)
    tasting_notes: str | None = Field(default=None, max_length=300)
    confidence: dict[str, float] = Field(default_factory=dict)


class AppDataPayload(BaseModel):
    beans: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)
    recipes: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)
    history: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)


def normalize_ai_recipe(raw: str) -> dict[str, Any]:
    """Accept harmless model deviations while preserving machine safety limits."""
    data = json.loads(raw)
    rpms = (60, 70, 80, 90, 100, 110, 120)
    data["rpm"] = min(rpms, key=lambda value: abs(value - float(data.get("rpm", 80))))
    # xBloom's pour-over range begins at 31; lower values are intended for
    # espresso/AeroPress and are not appropriate for recipes made here.
    data["grind"] = max(31, min(55, round(float(data.get("grind", 45)))))
    data["dose"] = max(5, min(30, float(data.get("dose", 18))))
    data["name"] = str(data.get("name") or "AI coffee recipe")[:80]
    data["rationale"] = str(data.get("rationale") or "Balanced for the selected coffee.")[:500]
    style = str(data.get("brew_style", "hot")).lower().replace("iced pour-over", "iced")
    data["brew_style"] = style if style in ("hot", "iced", "cold") else "hot"
    data["ice_grams"] = max(0, min(500, round(float(data.get("ice_grams", 0)))))
    patterns = {"centre": "center", "central": "center", "circle": "circular"}
    pours = data.get("pours")
    if not isinstance(pours, list) or not pours:
        raise ValueError("The response did not contain any pour steps.")
    normalized = []
    for pour in pours[:8]:
        pattern = patterns.get(str(pour.get("pattern", "center")).lower(), str(pour.get("pattern", "center")).lower())
        normalized.append({
            "volume": max(0, min(240, round(float(pour.get("volume", 0))))),
            "temp": max(80, min(96, round(float(pour.get("temp", 93))))),
            "flow": max(3.0, min(3.5, float(pour.get("flow", 3.2)))),
            "pauseAfter": max(0, min(60, round(float(pour.get("pauseAfter", 0))))),
            "pattern": pattern if pattern in ("center", "circular", "spiral") else "center",
            "agitationBefore": bool(pour.get("agitationBefore", False)),
            "agitationAfter": bool(pour.get("agitationAfter", False)),
        })
    data["pours"] = normalized
    return data


def recommended_pour_count(profile: BeanProfile, target_water: int, dose: float) -> int:
    details = " ".join(
        filter(
            None,
            (
                profile.roast_level,
                profile.process,
                profile.tasting_notes,
                profile.desired_cup,
                " ".join(profile.recipe_goals),
                " ".join(profile.user_preferences),
            ),
        )
    ).lower()
    roast = (profile.roast_level or "").lower()
    body_markers = ("full body", "low acidity", "chocolate", "nutty", "nuts")
    clarity_markers = ("light", "washed", "clarity", "floral", "tea-like", "high extraction", "delicate")
    if roast in ("medium", "medium-dark", "dark") or any(marker in details for marker in body_markers):
        preferred = 3
    elif sum(marker in details for marker in clarity_markers) >= 2:
        preferred = 5
    else:
        preferred = 4
    bloom = min(240, round(dose * 2.5))
    minimum_for_volume = 1 + math.ceil(max(0, target_water - bloom) / 240)
    return max(preferred, minimum_for_volume)


def fit_recipe_to_profile(recipe: AIRecipeResult, profile: BeanProfile) -> AIRecipeResult:
    """Make dose, step count, bloom, and total water exact without changing flavor choices."""
    dose = profile.dose if profile.dose is not None else recipe.dose
    ice_grams = recipe.ice_grams if profile.brew_style == "iced" else 0
    if profile.brew_style == "iced" and profile.target_water is None:
        gross_low, gross_high = 200 * profile.cups, min(500, 340 * profile.cups)
        gross_target = max(gross_low, min(gross_high, round(dose * 16)))
        ice_low, ice_high = 60 * profile.cups, 180 * profile.cups
        if not ice_low <= ice_grams <= ice_high:
            ice_grams = round(gross_target * 0.4)
        machine_low, machine_high = 100 * profile.cups, min(500, 220 * profile.cups)
        machine_water = max(machine_low, min(machine_high, gross_target - ice_grams))
        ice_grams = gross_target - machine_water
        target_water = machine_water
    else:
        target_water = profile.target_water if profile.target_water is not None else sum(p.volume for p in recipe.pours)
    gross_water = target_water + ice_grams if profile.brew_style == "iced" else target_water
    if profile.dose is None and not 14.5 <= gross_water / dose <= 18.5:
        # The model is allowed to choose both serving size and dose. Reconcile an
        # otherwise useful proposal instead of rejecting it for a mismatched ratio.
        dose = max(5.0, min(30.0, round(gross_water / 16, 1)))
    count = recommended_pour_count(profile, target_water, dose)
    pours = list(recipe.pours[:count])
    while len(pours) < count:
        pours.append(pours[-1].model_copy())
    bloom_min, bloom_max = round(dose * 2), round(dose * 4)
    bloom_volume = max(bloom_min, min(bloom_max, pours[0].volume))
    remaining = target_water - bloom_volume
    base, extra = divmod(remaining, count - 1)
    volumes = [bloom_volume] + [base + (1 if index < extra else 0) for index in range(count - 1)]
    fitted = []
    for index, (pour, volume) in enumerate(zip(pours, volumes)):
        fitted.append(pour.model_copy(update={
            "volume": volume,
            "pauseAfter": max(15, min(45, pour.pauseAfter or 30)) if index == 0 else (0 if index == count - 1 else pour.pauseAfter),
        }))
    estimated_seconds = sum(pour.volume / pour.flow + pour.pauseAfter for pour in fitted)
    pause_needed = max(0, math.ceil(105 - estimated_seconds))
    for index in range(max(0, len(fitted) - 1)):
        if pause_needed == 0:
            break
        limit = 45 if index == 0 else 60
        available = max(0, limit - fitted[index].pauseAfter)
        added = min(available, pause_needed)
        fitted[index] = fitted[index].model_copy(
            update={"pauseAfter": fitted[index].pauseAfter + added}
        )
        pause_needed -= added
    return recipe.model_copy(update={
        "dose": dose,
        "brew_style": profile.brew_style,
        "ice_grams": ice_grams,
        "pours": fitted,
    })


def recipe_quality_issues(recipe: AIRecipeResult, profile: BeanProfile) -> list[str]:
    """Check the generated plan against practical pour-over fundamentals."""
    issues: list[str] = []
    total = sum(p.volume for p in recipe.pours)
    if profile.target_water is not None and abs(total - profile.target_water) > 2:
        issues.append(f"pour volumes total {total} ml instead of {profile.target_water} ml")
    if profile.dose is not None and abs(recipe.dose - profile.dose) > 0.1:
        issues.append(f"dose changed from the requested {profile.dose} g to {recipe.dose} g")
    serving_ranges = {"hot": (180, 260), "iced": (100, 220), "cold": (150, 240)}
    low_per_cup, high_per_cup = serving_ranges[profile.brew_style]
    low, high = low_per_cup * profile.cups, min(500, high_per_cup * profile.cups)
    if profile.target_water is None and not low <= total <= high:
        issues.append(f"{profile.cups} {profile.brew_style} cup(s) should use about {low}-{high} ml, not {total} ml")
    if profile.brew_style == "iced":
        ice_low, ice_high = 60 * profile.cups, 180 * profile.cups
        if not ice_low <= recipe.ice_grams <= ice_high:
            issues.append(f"{profile.cups} iced cup(s) should use about {ice_low}-{ice_high} g ice, not {recipe.ice_grams} g")
        gross_water = total + recipe.ice_grams
        gross_low, gross_high = 200 * profile.cups, min(500, 340 * profile.cups)
        if not gross_low <= gross_water <= gross_high:
            issues.append(f"brewed water plus ice should total about {gross_low}-{gross_high} g, not {gross_water} g")
    else:
        gross_water = total
        if recipe.ice_grams != 0:
            issues.append("hot and cold recipes must return 0 g ice")
    ratio = gross_water / recipe.dose
    if not 14.5 <= ratio <= 18.5:
        issues.append(f"coffee-to-water ratio 1:{ratio:.1f} is outside the practical 1:14.5-1:18.5 range")
    expected_pours = recommended_pour_count(profile, total, recipe.dose)
    if len(recipe.pours) != expected_pours:
        issues.append(f"this coffee profile calls for {expected_pours} pours, not {len(recipe.pours)}")
    bloom = recipe.pours[0]
    bloom_min, bloom_max = round(recipe.dose * 2), round(recipe.dose * 4)
    if not bloom_min <= bloom.volume <= bloom_max:
        issues.append(f"bloom should be about 2-4x dose ({bloom_min:.0f}-{bloom_max:.0f} ml)")
    if not 15 <= bloom.pauseAfter <= 45:
        issues.append("the bloom pause should be 15-45 seconds")
    estimated_seconds = sum(p.volume / p.flow + p.pauseAfter for p in recipe.pours)
    if not 105 <= estimated_seconds <= 240:
        issues.append(f"estimated brew program is {estimated_seconds:.0f}s; target roughly 105-240s")
    return issues


async def ask_gemini(prompt: str, model: str) -> AIRecipeResult:
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
        async with httpx.AsyncClient(timeout=35) as session:
            response = None
            transport_error = None
            models = [model, os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")]
            for model in dict.fromkeys(models):
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                try:
                    response = await session.post(url, headers={"x-goog-api-key": api_key}, json=body)
                except httpx.RequestError as error:
                    transport_error = error
                    continue
                if response.status_code not in (429, 503):
                    break
        if response is None:
            reason = type(transport_error).__name__ if transport_error else "no response"
            raise HTTPException(502, f"Gemini did not respond ({reason}). Please try again.")
        if response.status_code >= 400:
            detail = response.json().get("error", {}).get("message", "Gemini request failed")
            raise HTTPException(502, detail)
        try:
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as error:
            raise HTTPException(502, "Gemini returned an empty response. Please try again.") from error
        result = AIRecipeResult.model_validate(normalize_ai_recipe(text))
    except HTTPException:
        raise
    except Exception as error:
        detail = str(error).strip() or type(error).__name__
        raise HTTPException(502, f"Gemini returned an invalid recipe: {detail}") from error
    total = sum(p.volume for p in result.pours)
    if total > 500:
        raise HTTPException(502, "The AI recipe exceeded the machine's 500 ml safety limit.")
    return result


async def read_bean_photo(request: BeanPhotoRequest, model: str) -> BeanPhotoResult:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(503, "Gemini is not configured. Add GEMINI_API_KEY to .env and restart the backend.")
    prompt = """Read this specialty-coffee package label and extract only facts visible on it.
Do not guess missing values. Use null when a field is absent or uncertain.
For name, use the coffee/product name, not the roaster name. Preserve named
varieties and processing terms. Put co-fermentation, infusion, honey type, or
decaffeination details in process_detail. Convert a printed acidity rating to a
1-5 scale only when the label provides enough evidence. Add a 0-1 confidence
score for every non-null extracted field in confidence. Return only JSON."""
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            *[
                {"inlineData": {"mimeType": image["mime_type"], "data": image["image_base64"]}}
                for image in request.images
            ],
        ]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseJsonSchema": BeanPhotoResult.model_json_schema(),
        },
    }
    models = [model, os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")]
    response = None
    try:
        async with httpx.AsyncClient(timeout=45) as session:
            for model in dict.fromkeys(models):
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                response = await session.post(url, headers={"x-goog-api-key": api_key}, json=body)
                if response.status_code not in (429, 503):
                    break
        if response is None or response.status_code >= 400:
            detail = response.json().get("error", {}).get("message", "Gemini image request failed") if response else "Gemini did not respond"
            raise HTTPException(502, detail)
        raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return BeanPhotoResult.model_validate_json(raw)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, f"The coffee label could not be read: {str(error) or type(error).__name__}") from error


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
    initialize_database()
    yield
    if client and client.is_connected:
        client._cleanup_on_disconnect = False
        await client.disconnect()


app = FastAPI(title="xBloom Local", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def protect_bluetooth_bridge(request, call_next):
    if IS_BLUETOOTH_BRIDGE and request.url.path.startswith("/api/") and request.url.path not in ("/api/health",):
        supplied = request.headers.get("X-XBloom-Bridge-Token", "")
        if not BLUETOOTH_BRIDGE_TOKEN or not secrets.compare_digest(supplied, BLUETOOTH_BRIDGE_TOKEN):
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=401, content={"detail": "Invalid Bluetooth bridge token."})
    return await call_next(request)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "pybloom": str(PYBLOOM_SRC),
        "aiConfigured": bool(os.getenv("GEMINI_API_KEY")),
        "bluetoothMode": "bridge-server" if IS_BLUETOOTH_BRIDGE else ("host-bridge" if BLUETOOTH_BRIDGE_URL else "native"),
    }


@app.get("/api/data", response_model=AppDataPayload)
async def get_app_data():
    return AppDataPayload(
        beans=read_collection("beans"),
        recipes=read_collection("recipes"),
        history=read_collection("history"),
    )


@app.put("/api/data")
async def save_app_data(payload: AppDataPayload):
    write_collection("beans", payload.beans)
    write_collection("recipes", payload.recipes)
    write_collection("history", payload.history)
    return {"saved": True}


@app.post("/api/ai/generate-recipe", response_model=AIRecipeResult)
async def generate_ai_recipe(profile: BeanProfile, x_gemini_model: str | None = Header(default=None)):
    model = selected_gemini_model(x_gemini_model)
    prompt = f"""You are an expert specialty-coffee recipe designer for an xBloom Studio.
Create one practical recipe from the bean profile below.
Return only the requested JSON schema. Respect every numeric schema limit.
If ai_choose_goals is true, choose the cup direction that best expresses this
specific coffee, using user_preferences only as a gentle tie-breaker. If it is
false, deliberately optimize for recipe_goals while keeping the recipe balanced.
Translate goals into brewing choices instead of merely repeating their names in
the rationale. Never try to maximize every sensory attribute at once.
You choose the coffee dose, total machine water, and (only for iced pour-over)
ice weight for the requested cups and brew style. Pour volumes are ONLY water
delivered by the xBloom and must never include ice. Use roughly 180-260 ml per
hot cup, 100-220 ml machine water plus 60-180 g ice per iced cup, or 150-240 ml
per cold cup. For iced recipes calculate ratio from machine water + ice. Return
brew_style exactly as requested and ice_grams=0 unless style is iced. Keep the
total-water ratio around 1:15-1:18 and total machine water at or below 500 ml.
This is a pour-over recipe. Grind uses the xBloom scale: espresso is near 1,
AeroPress near 16, pour-over is 31-55, and French press/cold brew begins near 56.
You MUST choose a grind from 31 through 55. Use finer values within that range
for more extraction and coarser values for less extraction.
The sum of pour volumes must equal the total water you choose and never exceed 500 ml.
Each individual pour is limited to 240 ml.
Use 3, 4, or 5 pours. Choose three for medium/darker, chocolate/nutty,
full-body or low-acidity goals; four for balanced, sweet or juicy profiles; and
five for light washed, floral/tea-like, high-clarity or high-extraction goals.
Do not default to one count. Temperatures are Celsius. Flow is ml/s.
For iced coffee, pours contain only machine water; ice_grams is separate.
For cold style, use the lowest supported temperature and explain the compromise in rationale.
Choose agitation conservatively. Keep the rationale concise and specific to the coffee.
Before returning JSON, silently check the recipe like a specialty-coffee barista:
- choose a coherent dose, machine water, and separate ice weight for the requested cups and style;
- make the pours total your chosen water amount exactly;
- use a bloom around 2-4 times the coffee dose with a 15-45 second rest;
- keep the estimated water-delivery plus pauses roughly 1:45-4:00;
- use an intentional coffee-to-water ratio, normally around 1:15-1:18;
- ensure every choice forms one coherent recipe rather than a reusable template.

Bean profile:
{profile.model_dump_json(exclude_none=True)}"""
    recipe = fit_recipe_to_profile(await ask_gemini(prompt, model), profile)
    issues = recipe_quality_issues(recipe, profile)
    if issues:
        repair_prompt = prompt + "\n\nYour previous proposal failed these checks:\n- " + "\n- ".join(issues) + "\nReturn a corrected recipe and vary only what is needed."
        recipe = fit_recipe_to_profile(await ask_gemini(repair_prompt, model), profile)
        remaining = recipe_quality_issues(recipe, profile)
        if remaining:
            raise HTTPException(502, "AI recipe did not pass the brew-quality checks: " + "; ".join(remaining))
    return recipe


@app.post("/api/ai/import-bean-photo", response_model=BeanPhotoResult)
async def import_bean_photo(request: BeanPhotoRequest, x_gemini_model: str | None = Header(default=None)):
    return await read_bean_photo(request, selected_gemini_model(x_gemini_model))


@app.post("/api/ai/enhance-recipe", response_model=AIRecipeResult)
async def enhance_ai_recipe(request: EnhanceRecipeRequest, x_gemini_model: str | None = Header(default=None)):
    model = selected_gemini_model(x_gemini_model)
    prompt = f"""You are an expert specialty-coffee dial-in assistant for an xBloom Studio.
Create an improved COPY of the recipe based on the user's taste feedback.
Return only the requested JSON schema. Respect every numeric schema limit.
Never exceed 500 ml total, 240 ml per pour, or 8 pours.
Preserve the requested brew style. For iced pour-over, pour volumes are only
machine water and ice_grams is separate; ratio uses machine water plus ice.
For hot or cold styles return ice_grams=0.
This is pour-over: the xBloom grind MUST remain from 31 through 55.
Choose 3, 4, or 5 pours deliberately. You may change the pour count when the
taste feedback supports it; do not automatically return three pours.
Make restrained, explainable changes rather than changing everything at once.
The new name must distinguish this version from the original.

Original recipe:
{request.recipe}

Bean profile (may be absent):
{request.bean.model_dump_json(exclude_none=True) if request.bean else "Not provided"}

Rating: {request.rating or "Not provided"}/5
Taste feedback: {request.feedback}"""
    recipe = await ask_gemini(prompt, model)
    if request.bean:
        recipe = fit_recipe_to_profile(recipe, request.bean)
        issues = recipe_quality_issues(recipe, request.bean)
        if issues:
            repair_prompt = prompt + "\n\nCorrect these brew-quality issues before returning JSON:\n- " + "\n- ".join(issues)
            recipe = fit_recipe_to_profile(await ask_gemini(repair_prompt, model), request.bean)
            remaining = recipe_quality_issues(recipe, request.bean)
            if remaining:
                raise HTTPException(502, "Improved recipe did not pass the brew-quality checks: " + "; ".join(remaining))
    return recipe


@app.get("/api/devices")
async def devices():
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("GET", "/api/devices")
    found = await discover_devices(timeout=7)
    return [{"name": d.name or "xBloom", "address": d.address} for d in found]


@app.post("/api/connect")
async def connect(request: ConnectRequest):
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("POST", "/api/connect", request.model_dump())
    global client, device_address
    if client and client.is_connected:
        return status_payload()

    async def attempt(address: str) -> bool:
        global client, device_address
        device_address = address
        candidate = XBloomClient(address)
        candidate._cleanup_on_disconnect = False
        try:
            connected = await candidate.connect(timeout=12)
        except Exception:
            connected = False
        if connected:
            client = candidate
            save_cached_address(address)
            return True
        try:
            await candidate.disconnect()
        except Exception:
            pass
        client = None
        return False

    cached = request.address or device_address or load_cached_address()
    if cached and await attempt(cached):
        return status_payload()

    for _ in range(2):
        try:
            found = await discover_devices(timeout=6)
        except (FileNotFoundError, OSError) as error:
            raise HTTPException(
                503,
                "Bluetooth is unavailable inside Docker Desktop. Run the API natively on Windows to connect to your xBloom machine.",
            ) from error
        for device in found:
            if await attempt(device.address):
                return status_payload()
        await asyncio.sleep(0.5)

    raise HTTPException(
        404,
        "No xBloom machine found after retrying. Disconnect the phone app, then cycle Bluetooth if needed.",
    )


@app.post("/api/bluetooth/settings")
async def open_bluetooth_settings():
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("POST", "/api/bluetooth/settings")
    if sys.platform != "win32":
        raise HTTPException(400, "Bluetooth settings shortcut is only available on Windows.")
    os.startfile("ms-settings:bluetooth")
    return {"opened": True}


@app.post("/api/disconnect")
async def disconnect():
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("POST", "/api/disconnect")
    global client
    if client and client.is_connected:
        client._cleanup_on_disconnect = False
        await client.disconnect()
    client = None
    return {"connected": False, "state": "offline"}


@app.get("/api/status")
async def get_status():
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("GET", "/api/status")
    return status_payload()


@app.post("/api/brew")
async def brew(request: BrewRequest):
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("POST", "/api/brew", request.model_dump())
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
    if BLUETOOTH_BRIDGE_URL:
        return await forward_to_bluetooth_bridge("POST", "/api/stop")
    if not client or not client.is_connected:
        raise HTTPException(409, "The machine is not connected.")
    await client.stop_recipe()
    return {"stopped": True}
