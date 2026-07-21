import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Coffee,
  History,
  LayoutDashboard,
  Library,
  Plus,
  Radio,
  Save,
  Settings,
  Thermometer,
  Trash2,
  Waves,
  Weight,
  X,
} from "lucide-react";
import { MachineStatus, xbloomApi } from "./api";

type Pour = {
  volume: number;
  temp: number;
  flow: number;
  pauseBefore: number;
  pauseAfter: number;
  pattern: "spiral" | "center" | "circular";
  agitationBefore: boolean;
  agitationAfter: boolean;
};
type Recipe = {
  id: number;
  name: string;
  roaster: string;
  origin: string;
  temp: number;
  ratio: string;
  duration: string;
  color: string;
  grind: number;
  rpm: 60 | 70 | 80 | 90 | 100 | 110 | 120;
  dose: number;
  unit: "g" | "ml";
  useGrinder: boolean;
  pours: Pour[];
};
const initialRecipes: Recipe[] = [
  {
    id: 1,
    name: "Morning Bloom",
    roaster: "Onyx",
    origin: "Ethiopia · Natural",
    temp: 93,
    ratio: "1:16",
    duration: "2:45",
    color: "#d78252",
    grind: 50,
    rpm: 80,
    dose: 18,
    unit: "ml",
    useGrinder: true,
    pours: [
      {
        volume: 50,
        temp: 93,
        flow: 3,
        pauseBefore: 5,
        pauseAfter: 30,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
      {
        volume: 119,
        temp: 93,
        flow: 3.5,
        pauseBefore: 0,
        pauseAfter: 10,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
      {
        volume: 119,
        temp: 93,
        flow: 3.5,
        pauseBefore: 0,
        pauseAfter: 0,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
    ],
  },
  {
    id: 2,
    name: "Citrus Study",
    roaster: "April",
    origin: "Kenya · Washed",
    temp: 92,
    ratio: "1:15",
    duration: "3:05",
    color: "#d3a83e",
    grind: 48,
    rpm: 80,
    dose: 18,
    unit: "ml",
    useGrinder: true,
    pours: [
      {
        volume: 55,
        temp: 92,
        flow: 3,
        pauseBefore: 5,
        pauseAfter: 35,
        pattern: "circular",
        agitationBefore: false,
        agitationAfter: true,
      },
      {
        volume: 110,
        temp: 92,
        flow: 3.4,
        pauseBefore: 0,
        pauseAfter: 15,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
      {
        volume: 105,
        temp: 91,
        flow: 3.5,
        pauseBefore: 0,
        pauseAfter: 0,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
    ],
  },
  {
    id: 3,
    name: "Soft Landing",
    roaster: "Sey",
    origin: "Colombia · Honey",
    temp: 90,
    ratio: "1:17",
    duration: "2:55",
    color: "#668b74",
    grind: 55,
    rpm: 70,
    dose: 17,
    unit: "g",
    useGrinder: true,
    pours: [
      {
        volume: 50,
        temp: 90,
        flow: 3,
        pauseBefore: 5,
        pauseAfter: 30,
        pattern: "center",
        agitationBefore: true,
        agitationAfter: false,
      },
      {
        volume: 119,
        temp: 90,
        flow: 3.3,
        pauseBefore: 0,
        pauseAfter: 10,
        pattern: "circular",
        agitationBefore: false,
        agitationAfter: false,
      },
      {
        volume: 120,
        temp: 89,
        flow: 3.4,
        pauseBefore: 0,
        pauseAfter: 0,
        pattern: "spiral",
        agitationBefore: false,
        agitationAfter: false,
      },
    ],
  },
];

type BrewSample = { time: number; water: number; coffee: number };
type BrewRecord = { id:number; recipeName:string; completedAt:string; duration:number; water:number; coffee:number; steps:number; simulated:boolean };
type BrewEstimate = {
  water: number;
  step: number;
  phase: string;
  complete: boolean;
  totalTime: number;
};
function estimateBrew(recipe: Recipe, elapsed: number): BrewEstimate {
  const totalTime = recipe.pours.reduce(
    (sum, p) => sum + p.volume / p.flow + p.pauseAfter,
    0,
  );
  let cursor = elapsed,
    water = 0;
  for (let i = 0; i < recipe.pours.length; i++) {
    const pour = recipe.pours[i];
    const pourTime = pour.volume / pour.flow;
    if (cursor < pourTime)
      return {
        water: water + cursor * pour.flow,
        step: i,
        phase: i === 0 ? "Blooming" : "Pouring",
        complete: false,
        totalTime,
      };
    water += pour.volume;
    cursor -= pourTime;
    if (cursor < pour.pauseAfter)
      return {
        water,
        step: i,
        phase: "Resting after pour",
        complete: false,
        totalTime,
      };
    cursor -= pour.pauseAfter;
  }
  return {
    water,
    step: recipe.pours.length - 1,
    phase: "Complete",
    complete: true,
    totalTime,
  };
}
function PatternGlyph({
  pattern,
  active,
}: {
  pattern: Pour["pattern"];
  active: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = 96,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    const color = active ? "#d9ff62" : "#92978e";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(48, 48, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(48, 48, 27, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (pattern === "center") {
      ctx.beginPath();
      ctx.arc(48, 48, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(48, 48, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (pattern === "circular") {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(48, 48, 20, -Math.PI * 0.15, Math.PI * 1.55);
      ctx.stroke();
      const a = Math.PI * 1.55,
        x = 48 + 20 * Math.cos(a),
        y = 48 + 20 * Math.sin(a);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-7, -4);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(48, 48, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * Math.PI * 4.4,
          r = 2.5 + (21 * t) / (Math.PI * 4.4),
          x = 48 + r * Math.cos(t),
          y = 48 + r * Math.sin(t);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(48, 48, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [pattern, active]);
  return <canvas ref={ref} className="pattern-canvas" aria-hidden="true" />;
}
function BrewChart({ samples, totalTime }: { samples: BrewSample[]; totalTime:number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const dpr = window.devicePixelRatio || 1,
      w = node.clientWidth,
      h = node.clientHeight;
    node.width = w * dpr;
    node.height = h * dpr;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#2d302a";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = 20 + (i * (h - 48)) / 3;
      ctx.beginPath();
      ctx.moveTo(52, y);
      ctx.lineTo(w - 34, y);
      ctx.stroke();
    }
    if (samples.length < 2) return;
    const maxTime = Math.max(60, totalTime, samples.at(-1)?.time || 60);
    const maxValue = Math.max(100, ...samples.flatMap((s) => [s.water, s.coffee]));
    (["water", "coffee"] as const).forEach((metric) => {
      const color = metric === "water" ? "#68a8ff" : "#d9ff62";
      let filtered = samples[0][metric];
      const points = samples.map((s) => {
        filtered = filtered * 0.72 + s[metric] * 0.28;
        return { x: 52 + (s.time / maxTime) * (w - 86), y: 20 + (1 - filtered / maxValue) * (h - 48) };
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2, midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const last = points.at(-1)!, before = points.at(-2)!;
      ctx.quadraticCurveTo(before.x, before.y, last.x, last.y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }, [samples, totalTime]);
  return <canvas className="brew-chart" ref={canvas} aria-label="Live chart of water poured and coffee collected" />;
}
const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const grindLabel = (value: number) =>
  value <= 15
    ? "Espresso"
    : value <= 30
      ? "AeroPress"
      : value <= 55
        ? "Pour-over coffee maker"
        : "French press · Cold brew";
function RangeBox({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  hint,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const fill = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <label
      className={`range-box ${disabled ? "disabled" : ""}`}
      style={{ "--range-fill": `${fill}%` } as React.CSSProperties}
    >
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="range-box-label">{label}</span>
      {hint && <span className="range-box-hint">{hint}</span>}
      <output>
        <b>{value}</b>
        <small>{unit}</small>
      </output>
    </label>
  );
}

function App() {
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [waterAlert, setWaterAlert] = useState(false);
  const [telemetry, setTelemetry] = useState<MachineStatus>({
    connected: false,
    state: "offline",
  });
  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("xbloom-recipes") || "null",
      );
      return (
        saved?.map((r: Recipe) => ({
          ...r,
          unit: r.unit || "ml",
          useGrinder: r.useGrinder !== false,
          pours: r.pours.map((p: Pour, i: number) => ({
            volume: p.volume,
            temp: p.temp || r.temp,
            flow: p.flow || 3.5,
            pauseBefore: i === 0 ? 5 : 0,
            pauseAfter: p.pauseAfter || 0,
            pattern: p.pattern || "spiral",
            agitationBefore: p.agitationBefore || false,
            agitationAfter: p.agitationAfter || false,
          })),
        })) || initialRecipes
      );
    } catch {
      return initialRecipes;
    }
  });
  const savedRecipes = useRef<Recipe[]>(structuredClone(recipes));
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(1);
  const selected = recipes.find((r) => r.id === selectedId) || recipes[0];
  const [machineName, setMachineName] = useState(
    () => localStorage.getItem("xbloom-machine-name") || "xBloom Studio",
  );
  const [brewing, setBrewing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [samples, setSamples] = useState<BrewSample[]>([]);
  const [brewComplete, setBrewComplete] = useState(false);
  const [brewTimingStarted, setBrewTimingStarted] = useState(false);
  const [simulation, setSimulation] = useState(false);
  const [history, setHistory] = useState<BrewRecord[]>(() => { try { return JSON.parse(localStorage.getItem("xbloom-history") || "[]") } catch { return [] } });
  const brewStart = useRef(0),
    brewerWasActive = useRef(false),
    brewWeightBaseline = useRef(0),
    brewRecorded = useRef(false);
  const [nav, setNav] = useState("Home");
  const navItems = useMemo(
    () => [
      { name: "Home", icon: LayoutDashboard },
      { name: "Recipes", icon: Library },
      { name: "History", icon: History },
      { name: "Settings", icon: Settings },
    ],
    [],
  );

  useEffect(() => {
    if (!brewing || !brewTimingStarted) return;
    const timer = setInterval(
      () => setElapsed(Math.floor(((Date.now() - brewStart.current) / 1000) * (simulation ? 4 : 1))),
      250,
    );
    return () => clearInterval(timer);
  }, [brewing, brewTimingStarted, simulation]);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const next = await xbloomApi.status();
        setTelemetry(next);
        setConnected(next.connected);
      } catch {
        /* API may still be starting */
      }
    }, 1000);
    return () => clearInterval(poll);
  }, []);
  useEffect(
    () => localStorage.setItem("xbloom-machine-name", machineName),
    [machineName],
  );
  useEffect(() => {
    if (connected && telemetry.waterLevelOk === false) setWaterAlert(true);
    if (telemetry.waterLevelOk === true) setWaterAlert(false);
  }, [connected, telemetry.waterLevelOk]);
  const brewEstimate = estimateBrew(selected, elapsed);
  useEffect(() => {
    if (simulation || !brewing || brewTimingStarted || !telemetry.brewerRunning) return;
    brewStart.current = Date.now();
    brewWeightBaseline.current = telemetry.weight || brewWeightBaseline.current;
    setElapsed(0);
    setSamples([{ time: 0, water: 0, coffee: 0 }]);
    setBrewTimingStarted(true);
  }, [simulation, brewing, brewTimingStarted, telemetry.brewerRunning, telemetry.weight]);
  useEffect(() => {
    if (!brewing || !brewTimingStarted) return;
    setSamples((list) =>
      [
        ...list,
        {
          time: elapsed,
          water: brewEstimate.water,
          coffee: simulation
            ? estimateBrew(selected, Math.max(0, elapsed - 4)).water * 0.82
            : Math.max(0, (telemetry.weight || 0) - brewWeightBaseline.current),
        },
      ].slice(-900),
    );
  }, [brewing, brewTimingStarted, simulation, selected, elapsed, brewEstimate.water, telemetry.weight]);
  useEffect(() => {
    if (telemetry.brewerRunning) brewerWasActive.current = true;
    if (!brewing || !brewTimingStarted) return;
    if (simulation ? brewEstimate.complete : (
      telemetry.state === "complete" ||
      (brewerWasActive.current && !telemetry.brewerRunning && elapsed > 10) ||
      elapsed >= brewEstimate.totalTime + 15
    )) {
      setBrewing(false);
      setBrewComplete(true);
    }
  }, [
    brewing,
    brewTimingStarted,
    simulation,
    elapsed,
    brewEstimate.totalTime,
    telemetry.brewerRunning,
    telemetry.state,
  ]);
  useEffect(() => {
    if (!brewComplete || brewRecorded.current) return;
    brewRecorded.current = true;
    const last = samples.at(-1);
    const record:BrewRecord = { id:Date.now(), recipeName:selected.name, completedAt:new Date().toISOString(), duration:elapsed, water:last?.water||0, coffee:last?.coffee||0, steps:selected.pours.length, simulated:simulation };
    setHistory((current) => { const next=[record,...current].slice(0,100); localStorage.setItem("xbloom-history",JSON.stringify(next)); return next });
  }, [brewComplete, elapsed, samples, selected.name, selected.pours.length, simulation]);

  function updateRecipe(patch: Partial<Recipe>) {
    setRecipeDirty(true);
    setRecipes((list) =>
      list.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)),
    );
  }
  function saveRecipeChanges() {
    localStorage.setItem("xbloom-recipes", JSON.stringify(recipes));
    savedRecipes.current = structuredClone(recipes);
    setRecipeDirty(false);
  }
  function selectRecipe(id: number) {
    if (id === selected.id) return;
    if (recipeDirty && !window.confirm("Discard your unsaved recipe changes?")) return;
    if (recipeDirty) setRecipes(structuredClone(savedRecipes.current));
    setRecipeDirty(false);
    setSelectedId(savedRecipes.current.some((r) => r.id === id) ? id : savedRecipes.current[0].id);
  }
  function updatePour(index: number, patch: Partial<Pour>) {
    updateRecipe({
      pours: selected.pours.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    });
  }
  function addPour() {
    if (selected.pours.length >= 8) return;
    updateRecipe({
      pours: [
        ...selected.pours,
        {
          volume: 50,
          temp: selected.pours.at(-1)?.temp || selected.temp,
          flow: 3.5,
          pauseBefore: 0,
          pauseAfter: 0,
          pattern: "spiral",
          agitationBefore: false,
          agitationAfter: false,
        },
      ],
    });
  }
  function removePour(index: number) {
    if (selected.pours.length === 1) {
      setConnectionError("A recipe needs at least one pour step.");
      return;
    }
    if (window.confirm(`Remove pour ${index + 1}?`))
      updateRecipe({ pours: selected.pours.filter((_, i) => i !== index) });
  }
  function newRecipe() {
    const id = Date.now();
    setRecipes((list) => [
      ...list,
      {
        ...initialRecipes[0],
        id,
        name: "Untitled recipe",
        roaster: "Your roaster",
        origin: "Coffee origin",
      },
    ]);
    setSelectedId(id);
    setRecipeDirty(true);
    setNav("Recipes");
  }
  function removeRecipe() {
    if (recipes.length === 1) {
      setConnectionError("Keep at least one recipe in your library.");
      return;
    }
    if (!window.confirm(`Remove “${selected.name}” from your recipes?`)) return;
    const remaining = recipes.filter((r) => r.id !== selected.id);
    setRecipes(remaining);
    setSelectedId(remaining[0].id);
    setRecipeDirty(true);
  }

  async function toggleConnection() {
    if (connected) {
      setScanning(true);
      setConnectionError("");
      try {
        const status = await xbloomApi.disconnect();
        setTelemetry(status);
        setConnected(false);
        setBrewing(false);
      } catch (error) {
        setConnectionError(
          error instanceof Error
            ? error.message
            : "Could not disconnect from xBloom.",
        );
      } finally {
        setScanning(false);
      }
      return;
    }
    setScanning(true);
    setConnectionError("");
    try {
      const status = await xbloomApi.connect();
      setTelemetry(status);
      setConnected(status.connected);
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not connect to xBloom.",
      );
    } finally {
      setScanning(false);
    }
  }
  async function startBrew() {
    if (recipeDirty) {
      setConnectionError("Save your recipe changes before starting a brew.");
      setNav("Recipes");
      return;
    }
    if (!connected) return toggleConnection();
    if (
      !window.confirm(
        `Start “${selected.name}”?\n\nCheck that the water tank, beans, dripper, and cup are in place.`,
      )
    )
      return;
    setConnectionError("");
    setSimulation(false);
    try {
      brewWeightBaseline.current = telemetry.weight || 0;
      await xbloomApi.brew({
        name: selected.name,
        use_grinder: selected.useGrinder,
        grind_size: selected.grind,
        rpm: selected.rpm,
        bean_weight: selected.dose,
        confirmed: true,
        pours: selected.pours.map((p) => ({
          volume: p.volume,
          temperature: p.temp,
          flow_rate: p.flow,
          pause_before: p.pauseBefore,
          pause_after: p.pauseAfter,
          pattern: p.pattern,
          agitation_before: p.agitationBefore,
          agitation_after: p.agitationAfter,
        })),
      });
      brewerWasActive.current = false;
      brewRecorded.current = false;
      setProgress(0);
      setElapsed(0);
      setSamples([{ time: 0, water: 0, coffee: 0 }]);
      setBrewTimingStarted(false);
      setBrewComplete(false);
      setWaterAlert(false);
      setBrewing(true);
      setNav("Brew");
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Brew could not start.",
      );
    }
  }
  function startSimulation() {
    setConnectionError("");
    setSimulation(true);
    brewStart.current = Date.now();
    brewerWasActive.current = false;
    brewRecorded.current = false;
    brewWeightBaseline.current = 0;
    setElapsed(0);
    setSamples([{ time: 0, water: 0, coffee: 0 }]);
    setBrewComplete(false);
    setWaterAlert(false);
    setBrewTimingStarted(true);
    setBrewing(true);
    setNav("Brew");
  }
  async function stopBrew() {
    if (simulation) {
      setBrewing(false);
      setSimulation(false);
      setNav("Home");
      return;
    }
    try {
      await xbloomApi.stop();
      setBrewing(false);
      setNav("Home");
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not stop.",
      );
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">x</span>
          <span>Bloom</span>
        </div>
        <nav>
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={nav === name ? "active" : ""}
              onClick={() => setNav(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="machine-mini">
            <div className="machine-dot" data-on={connected} />
            <div>
              <strong>{machineName}</strong>
              <span>{connected ? "Connected" : "Not connected"}</span>
            </div>
          </div>
          <small>DESKTOP COMPANION · 0.1</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">GOOD AFTERNOON</p>
            <h1>
              Your next cup,
              <br />
              <em>beautifully dialed.</em>
            </h1>
          </div>
          <div className="connection">
            <button
              className={connected ? "device connected" : "device"}
              onClick={toggleConnection}
              disabled={scanning || brewing}
              title={
                connected
                  ? "Disconnect from xBloom"
                  : "Find and connect to xBloom"
              }
            >
              <Radio size={17} />
              {scanning
                ? connected
                  ? "Disconnecting…"
                  : "Searching…"
                : connected
                  ? "Disconnect Studio"
                  : "Connect machine"}
            </button>
            {connectionError && <span>{connectionError}</span>}
          </div>
        </header>
        {waterAlert && (
          <div className="water-alert" role="alert">
            <span className="alert-icon">
              <AlertTriangle size={19} />
            </span>
            <div>
              <strong>Water level is low</strong>
              <span>
                Fill the xBloom water tank before starting your next brew.
              </span>
            </div>
            <button
              onClick={() => setWaterAlert(false)}
              aria-label="Dismiss low water alert"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {nav === "Recipes" && (
          <section className="editor-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">RECIPE STUDIO</p>
                <h2>Edit your brew</h2>
              </div>
              <div className="recipe-actions">
                <button className="save-recipe" onClick={saveRecipeChanges} disabled={!recipeDirty}>
                  <Save size={17} /> {recipeDirty ? "Save changes" : "Saved"}
                </button>
                <button className="remove-recipe" onClick={removeRecipe}>
                  <Trash2 size={17} /> Remove recipe
                </button>
                <button className="add-button" onClick={newRecipe}>
                  <Plus size={17} /> New recipe
                </button>
              </div>
            </div>
            <div className="editor-layout">
              <div className="recipe-list">
                {recipes.map((r) => (
                  <button
                    className={r.id === selected.id ? "selected" : ""}
                    onClick={() => selectRecipe(r.id)}
                    key={r.id}
                  >
                    <span className="bean" style={{ background: r.color }} />
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.origin}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="form-card">
                <div className="form-grid">
                  <label>
                    Recipe name
                    <input
                      value={selected.name}
                      onChange={(e) => updateRecipe({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    Roaster
                    <input
                      value={selected.roaster}
                      onChange={(e) =>
                        updateRecipe({ roaster: e.target.value })
                      }
                    />
                  </label>
                  <label className="wide">
                    Origin
                    <input
                      value={selected.origin}
                      onChange={(e) => updateRecipe({ origin: e.target.value })}
                    />
                  </label>
                </div>
                <section className="basics-card">
                  <div className="subsection-heading">
                    <div>
                      <p className="eyebrow">COFFEE SETUP</p>
                      <h3>Dose & grinder</h3>
                    </div>
                    <span>
                      {selected.useGrinder ? "Automatic" : "Pre-ground"}
                    </span>
                  </div>
                  <div className="basics-grid">
                    <RangeBox
                      label="Dose"
                      value={selected.dose}
                      min={5}
                      max={30}
                      step={0.5}
                      unit="g"
                      onChange={(dose) => updateRecipe({ dose })}
                    />
                    <RangeBox
                      label="Grind size"
                      value={selected.grind}
                      min={1}
                      max={80}
                      unit=""
                      hint={grindLabel(selected.grind)}
                      disabled={!selected.useGrinder}
                      onChange={(grind) => updateRecipe({ grind })}
                    />
                    <RangeBox
                      label="Grinder speed"
                      value={selected.rpm}
                      min={60}
                      max={120}
                      step={10}
                      unit="RPM"
                      disabled={!selected.useGrinder}
                      onChange={(rpm) =>
                        updateRecipe({ rpm: rpm as Recipe["rpm"] })
                      }
                    />
                    <label>
                      Water unit
                      <select
                        value={selected.unit}
                        onChange={(e) =>
                          updateRecipe({
                            unit: e.target.value as Recipe["unit"],
                          })
                        }
                      >
                        <option value="ml">Milliliters (ml)</option>
                        <option value="g">Grams (g)</option>
                      </select>
                    </label>
                    <div className="grinder-choice wide">
                      <div>
                        <strong>Use xBloom grinder</strong>
                        <small>
                          {selected.useGrinder
                            ? "The machine will grind the beans before brewing."
                            : "Pre-ground mode — only the water recipe will run."}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={selected.useGrinder ? "toggle on" : "toggle"}
                        onClick={() =>
                          updateRecipe({ useGrinder: !selected.useGrinder })
                        }
                        aria-pressed={selected.useGrinder}
                      >
                        <span />
                      </button>
                    </div>
                  </div>
                </section>
                <div className="pours-heading">
                  <h3>Pour steps</h3>
                  <div className="pour-summary">
                    <span>
                      {selected.pours.reduce((sum, p) => sum + p.volume, 0)}{" "}
                      {selected.unit} total
                    </span>
                    <span>{selected.pours.length} pours</span>
                    <b>
                      1:
                      {(
                        selected.pours.reduce((sum, p) => sum + p.volume, 0) /
                        selected.dose
                      ).toFixed(1)}{" "}
                      ratio
                    </b>
                  </div>
                </div>
                {selected.pours.map((p, i) => (
                  <div className="pour-step" id={`pour-step-${i}`} key={i}>
                    <div className="pour-step-title">
                      <b>{i + 1}</b>
                      <div>
                        <strong>{i === 0 ? "Bloom" : `Pour ${i + 1}`}</strong>
                        <small>
                          Step {i + 1} of {selected.pours.length}
                        </small>
                      </div>
                      <button
                        className="remove-step"
                        onClick={() => removePour(i)}
                        disabled={selected.pours.length === 1}
                        title="Remove this pour"
                      >
                        <Trash2 size={18} />
                        <span>Remove</span>
                      </button>
                    </div>
                    <RangeBox
                      label="Water volume"
                      value={p.volume}
                      min={0}
                      max={100}
                      unit={selected.unit}
                      hint={`Pour ${i + 1} of ${selected.pours.length}`}
                      onChange={(volume) => updatePour(i, { volume })}
                    />
                    <div className="pour-fields">
                      <label>
                        Temperature (°C)
                        <input
                          type="number"
                          min="80"
                          max="96"
                          value={p.temp}
                          onChange={(e) =>
                            updatePour(i, { temp: +e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Flow rate (ml/s)
                        <select
                          value={p.flow}
                          onChange={(e) =>
                            updatePour(i, { flow: +e.target.value })
                          }
                        >
                          {[3, 3.1, 3.2, 3.3, 3.4, 3.5].map((v) => (
                            <option key={v}>{v.toFixed(1)}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <RangeBox
                      label="Pause after"
                      value={p.pauseAfter}
                      min={0}
                      max={60}
                      unit="sec"
                      hint="Rest before the next pour"
                      onChange={(pauseAfter) => updatePour(i, { pauseAfter })}
                    />
                    <fieldset className="pattern-picker">
                      <legend>Pour pattern</legend>
                      {(["center", "circular", "spiral"] as const).map(
                        (pattern) => (
                          <button
                            type="button"
                            key={pattern}
                            className={p.pattern === pattern ? "active" : ""}
                            onClick={() => updatePour(i, { pattern })}
                            aria-pressed={p.pattern === pattern}
                          >
                            <PatternGlyph
                              pattern={pattern}
                              active={p.pattern === pattern}
                            />
                            <span>
                              {pattern === "center"
                                ? "Centered"
                                : pattern[0].toUpperCase() + pattern.slice(1)}
                            </span>
                          </button>
                        ),
                      )}
                    </fieldset>
                    <div className="agitation-row">
                      <span>Agitation</span>
                      <label className="check-control">
                        <input
                          type="checkbox"
                          checked={p.agitationBefore}
                          onChange={(e) =>
                            updatePour(i, { agitationBefore: e.target.checked })
                          }
                        />
                        <span>Before pour</span>
                      </label>
                      <label className="check-control">
                        <input
                          type="checkbox"
                          checked={p.agitationAfter}
                          onChange={(e) =>
                            updatePour(i, { agitationAfter: e.target.checked })
                          }
                        />
                        <span>After pour</span>
                      </label>
                    </div>
                  </div>
                ))}
                <button
                  className="add-pour"
                  onClick={addPour}
                  disabled={selected.pours.length >= 8}
                >
                  <Plus size={20} />
                  <span>Add pour</span>
                  <small>
                    {selected.pours.length >= 8
                      ? "Maximum 8 steps"
                      : `Creates pour ${selected.pours.length + 1}`}
                  </small>
                </button>
              </div>
              <aside className="recipe-visual">
                <div>
                  <p className="eyebrow">POUR SUMMARY</p>
                  <h3>{selected.pours.length} steps</h3>
                  <span>
                    {selected.pours.reduce((sum, p) => sum + p.volume, 0)}{" "}
                    {selected.unit} · 1:
                    {(
                      selected.pours.reduce((sum, p) => sum + p.volume, 0) /
                      selected.dose
                    ).toFixed(1)}{" "}
                    ratio
                  </span>
                </div>
                <div
                  className="pour-bars"
                  style={{
                    gridTemplateColumns: `repeat(${selected.pours.length}, minmax(0, 1fr))`,
                  }}
                >
                  {selected.pours.map((p, i) => (
                    <article
                      key={i}
                      className="summary-pour"
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${i === 0 ? "Bloom" : `Pour ${i + 1}`}`}
                      onClick={() => document.getElementById(`pour-step-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") document.getElementById(`pour-step-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
                      style={{
                        height: `${Math.max(210, 170 + p.volume * 1.7)}px`,
                      }}
                    >
                      <header>
                        <b>{i + 1}</b>
                        <strong>
                          {p.volume}
                          <small>{selected.unit}</small>
                        </strong>
                      </header>
                      <div className="summary-pattern">
                        <PatternGlyph pattern={p.pattern} active={true} />
                        <strong>{p.temp}°C</strong>
                      </div>
                      <span className="summary-step-name">{i===0?'Bloom':`Pour ${i+1}`}</span>
                      <div className="summary-facts">
                        <span>{p.pauseAfter}<small>sec</small></span>
                      </div>
                      {p.agitationBefore&&<span className="pause-corner before"><Waves size={12}/></span>}
                      {p.agitationAfter&&<span className="pause-corner after"><Waves size={12}/></span>}
                    </article>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        )}
        {nav === "Settings" && (
          <section className="editor-page settings-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">PREFERENCES</p>
                <h2>Settings</h2>
              </div>
            </div>
            <div className="form-card">
              <label>
                Machine name
                <input
                  value={machineName}
                  onChange={(e) => setMachineName(e.target.value)}
                />
                <small>Shown throughout your local dashboard.</small>
              </label>
              <div className="setting-row">
                <div>
                  <strong>Local-only connection</strong>
                  <small>
                    Bluetooth and the control API remain on this computer.
                  </small>
                </div>
                <span className="safe-pill">Enabled</span>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Disconnect protection</strong>
                  <small>
                    Disconnecting will not abort an active machine operation.
                  </small>
                </div>
                <span className="safe-pill">Enabled</span>
              </div>
              <button
                className="danger-button"
                onClick={() => {
                  setRecipes(initialRecipes);
                  setSelectedId(1);
                  setRecipeDirty(true);
                }}
              >
                Restore default recipes
              </button>
            </div>
          </section>
        )}
        {nav === "History" && (
          <section className="editor-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">BREW JOURNAL</p>
                <h2>History</h2>
              </div>
            </div>
            {history.length===0?<div className="empty-card"><History/><h3>Your completed brews will appear here</h3><p>History recording will begin with your next completed brew or simulation.</p></div>:<div className="history-list">{history.map(record=><article key={record.id}><span className="history-icon"><Coffee size={20}/></span><div><strong>{record.recipeName}</strong><small>{new Date(record.completedAt).toLocaleString()} · {record.steps} steps {record.simulated?'· Simulation':''}</small></div><b>{formatTime(record.duration)}</b><span>{record.water.toFixed(0)} ml</span><span>{record.coffee.toFixed(1)} g</span></article>)}</div>}
          </section>
        )}

        {nav === "Brew" && (
          <section className="brew-session">
            <div className="session-heading">
              <div>
                <p className="eyebrow">
                  {brewComplete ? (simulation ? "SIMULATION COMPLETE" : "BREW COMPLETE") : simulation ? "BREW SIMULATION · 4× SPEED" : "LIVE BREW"}
                </p>
                <h2>{selected.name}</h2>
                <p>{brewComplete ? "Your cup is ready." : brewTimingStarted ? brewEstimate.phase : selected.useGrinder ? "Grinding, settling & positioning" : "Settling & positioning"}</p>
              </div>
              <span
                className={
                  brewComplete ? "session-state complete" : "session-state"
                }
              >
                {brewComplete ? "Complete" : brewTimingStarted ? `Step ${brewEstimate.step + 1} of ${selected.pours.length}` : "Preparing"}
              </span>
            </div>
            <div className="session-stats">
              <div>
                <small>ELAPSED</small>
                <strong>{formatTime(elapsed)}</strong>
              </div>
              <div>
                <small>ESTIMATED WATER</small>
                <strong>
                  {samples.at(-1)?.water.toFixed(0) || "0"} <i>ml</i>
                </strong>
              </div>
              <div>
                <small>COFFEE COLLECTED</small>
                <strong>
                  {samples.at(-1)?.coffee.toFixed(1) || "0.0"} <i>g</i>
                </strong>
              </div>
              <div>
                <small>STEPS REMAINING</small>
                <strong>
                  {brewComplete
                    ? 0
                    : Math.max(
                        0,
                        selected.pours.length - brewEstimate.step - 1,
                      )}
                </strong>
              </div>
            </div>
            <article className="graph-card combined-graph">
              <div className="combined-legend"><span><i className="graph-dot water"/><strong>Water poured</strong></span><span><i className="graph-dot coffee"/><strong>Coffee collected</strong></span><small>Live · {formatTime(elapsed)}</small></div>
              <BrewChart samples={samples} totalTime={brewEstimate.totalTime}/>
            </article>
            <article className="step-card">
              <div className="step-card-heading">
                <div>
                  <p className="eyebrow">BREW TIMELINE</p>
                  <h3>
                    {brewComplete ? "All steps finished" : brewTimingStarted ? brewEstimate.phase : "Waiting for water flow"}
                  </h3>
                </div>
                <span>
                  {selected.pours.reduce((sum, p) => sum + p.volume, 0)} ml
                  total
                </span>
              </div>
              <div className="pour-bars live-pour-bars" style={{gridTemplateColumns:`repeat(${selected.pours.length}, minmax(0, 1fr))`}}>
                {selected.pours.map((p, i) => {
                  const state =
                    brewComplete || (brewTimingStarted && i < brewEstimate.step)
                      ? "done"
                      : brewTimingStarted && i === brewEstimate.step
                        ? "current"
                        : "upcoming";
                  return (
                    <article className={`live-pour ${state}`} key={i} style={{height:`${Math.max(185,150+p.volume*1.35)}px`}}>
                      <header><b>{state==='done'?'✓':i+1}</b><strong>{p.volume}<small>ml</small></strong></header>
                      <div className="summary-pattern"><PatternGlyph pattern={p.pattern} active={state==='current'}/><strong>{p.temp}°C</strong></div>
                      <span className="summary-step-name">{i===0?'Bloom':`Pour ${i+1}`}</span>
                      <div className="summary-facts"><span>{p.pauseAfter}<small>sec</small></span></div>
                      <span className="live-step-state">{!brewTimingStarted?'Waiting':state==='current'?brewEstimate.phase:state==='done'?'Done':'Waiting'}</span>
                    </article>
                  );
                })}
              </div>
            </article>
            {brewing ? (
              <button
                className="primary stop session-action"
                onClick={stopBrew}
              >
                Stop brew · {formatTime(elapsed)}
                <span>■</span>
              </button>
            ) : (
              <button
                className="primary session-action"
                onClick={() => setNav("Home")}
              >
                {brewComplete ? "Done" : "Back to home"}
                <span>→</span>
              </button>
            )}
            {simulation && brewing && <p className="simulation-note">Simulation only — no commands are being sent to your xBloom.</p>}
            {!simulation && !connected && brewing && (
              <p className="session-note">
                Machine connection was lost. Water remains estimated from the
                recipe timeline.
              </p>
            )}
          </section>
        )}

        <div
          className={nav === "Home" ? "home-content" : "home-content hidden"}
        >
          <section className="hero-grid">
            <article className="brew-card">
              <div className="brew-top">
                <div>
                  <p className="eyebrow">READY TO BREW</p>
                  <h2>{selected.name}</h2>
                  <p>
                    {selected.roaster} · {selected.origin}
                  </p>
                </div>
                <button className="ghost" onClick={() => setNav("Recipes")}>
                  Edit recipe
                </button>
              </div>
              <div className="brew-visual">
                <div className="orbit one" />
                <div className="orbit two" />
                <div className="cup">
                  <Coffee size={42} />
                  <span>{selected.dose}g</span>
                </div>
              </div>
              <div className="metrics">
                <div>
                  <Thermometer />
                  <span>
                    <b>{telemetry.temperature?.toFixed(1) ?? selected.temp}°</b>
                    C
                  </span>
                </div>
                <div>
                  <Weight />
                  <span>
                    <b>{telemetry.weight?.toFixed(1) ?? "288"}</b>g{" "}
                    {telemetry.weight === undefined ? "water" : "scale"}
                  </span>
                </div>
                <div>
                  <Waves />
                  <span>
                    <b>{selected.duration}</b> total
                  </span>
                </div>
              </div>
              <div className="brew-actions-main">
                <button className="simulate-button" onClick={startSimulation} disabled={brewing}>Simulate brew <span>▶</span></button>
                <button className={brewing ? "primary stop" : "primary"} onClick={brewing ? stopBrew : startBrew}>
                  {brewing ? `Stop brew · ${formatTime(elapsed)}` : connected ? "Start brew" : "Connect & brew"}
                  <span>{brewing ? "■" : "→"}</span>
                </button>
              </div>
              {connectionError && (
                <p className="brew-error" role="alert">
                  {connectionError}
                </p>
              )}
            </article>

            <div className="right-column">
              <article className="machine-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">YOUR MACHINE</p>
                    <h3>{machineName}</h3>
                  </div>
                  <div className="status-dot" data-on={connected} />
                </div>
                <div className="machine-photo">
                  <img
                    src="/xbloom-studio-cutout.png"
                    alt="Midnight Black xBloom Studio brewing coffee"
                  />
                </div>
                <div className="machine-stats">
                  <span>
                    Water{" "}
                    <b>
                      {telemetry.waterVolume !== undefined
                        ? `${Math.round(telemetry.waterVolume)} ml`
                        : "—"}
                    </b>
                  </span>
                  <span>
                    Machine <b>{connected ? telemetry.state : "offline"}</b>
                  </span>
                </div>
              </article>
              <article className="last-brew">
                <p className="eyebrow">LAST BREW</p>
                {history[0]?<><div><strong>{history[0].recipeName}</strong><span>{new Date(history[0].completedAt).toLocaleString()} {history[0].simulated?'· Simulation':''}</span></div><b className="last-duration">{formatTime(history[0].duration)}</b></>:<><div><strong>No completed brews</strong><span>Run a brew or simulation to begin</span></div><b className="last-duration">—</b></>}
              </article>
            </div>
          </section>

          <section className="recipes">
            <div className="section-title">
              <div>
                <p className="eyebrow">YOUR LIBRARY</p>
                <h2>Saved recipes</h2>
              </div>
              <button onClick={newRecipe}>
                <Plus size={17} /> New recipe
              </button>
            </div>
            <div className="recipe-row">
              {recipes.map((r) => (
                <button
                  key={r.id}
                  className={`recipe ${selected.id === r.id ? "selected" : ""}`}
                  onClick={() => selectRecipe(r.id)}
                >
                  <span className="bean" style={{ background: r.color }} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.origin}</small>
                  </span>
                  <b>Grind {r.grind}</b>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
export default App;
