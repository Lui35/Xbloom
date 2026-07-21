import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, History, LayoutDashboard, Library, Settings } from "lucide-react";
import { AIRecipeResult, MachineStatus, xbloomApi } from "../api";
import type { Bean, BrewRecord, BrewSample, Pour, Recipe } from "../domain/models";
import { blankBean, initialRecipes } from "../domain/recipes";
import { estimateBrew, formatTime } from "../domain/brewing";

export function useAppController() {
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
      const saved = JSON.parse(localStorage.getItem("xbloom-recipes") || "null");
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
  const [aiMode, setAiMode] = useState<"create" | "enhance" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<AIRecipeResult | null>(null);
  const [aiFeedback, setAiFeedback] = useState("");
  const [aiRating, setAiRating] = useState(4);
  const [beans, setBeans] = useState<Bean[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("xbloom-beans") || "[]");
    } catch {
      return [];
    }
  });
  const [aiBean, setAiBean] = useState<Bean>(blankBean);
  const [selectedBeanId, setSelectedBeanId] = useState<number | null>(null);
  const [beanEditor, setBeanEditor] = useState(false);
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
  const [history, setHistory] = useState<BrewRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("xbloom-history") || "[]").filter(
        (record: { simulated?: boolean }) => !record.simulated,
      );
    } catch {
      return [];
    }
  });
  const brewStart = useRef(0),
    brewerWasActive = useRef(false),
    brewWeightBaseline = useRef(0),
    brewRecorded = useRef(false);
  const [nav, setNav] = useState("Home");
  const navItems = useMemo(
    () => [
      { name: "Home", icon: LayoutDashboard },
      { name: "Recipes", icon: Library },
      { name: "Beans", icon: Coffee },
      { name: "History", icon: History },
      { name: "Settings", icon: Settings },
    ],
    [],
  );

  useEffect(() => {
    if (!brewing || !brewTimingStarted) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - brewStart.current) / 1000)),
      250,
    );
    return () => clearInterval(timer);
  }, [brewing, brewTimingStarted]);

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
  useEffect(() => localStorage.setItem("xbloom-machine-name", machineName), [machineName]);
  useEffect(() => {
    if (connected && telemetry.waterLevelOk === false) setWaterAlert(true);
    if (telemetry.waterLevelOk === true) setWaterAlert(false);
  }, [connected, telemetry.waterLevelOk]);
  const brewEstimate = estimateBrew(selected, elapsed);
  useEffect(() => {
    if (!brewing || brewTimingStarted || !telemetry.brewerRunning) return;
    brewStart.current = Date.now();
    brewWeightBaseline.current = telemetry.weight || brewWeightBaseline.current;
    setElapsed(0);
    setSamples([{ time: 0, water: 0, coffee: 0 }]);
    setBrewTimingStarted(true);
  }, [brewing, brewTimingStarted, telemetry.brewerRunning, telemetry.weight]);
  useEffect(() => {
    if (!brewing || !brewTimingStarted) return;
    setSamples((list) =>
      [
        ...list,
        {
          time: elapsed,
          water: brewEstimate.water,
          coffee: Math.max(0, (telemetry.weight || 0) - brewWeightBaseline.current),
        },
      ].slice(-900),
    );
  }, [brewing, brewTimingStarted, elapsed, brewEstimate.water, telemetry.weight]);
  useEffect(() => {
    if (telemetry.brewerRunning) brewerWasActive.current = true;
    if (!brewing || !brewTimingStarted) return;
    if (
      telemetry.state === "complete" ||
      (brewerWasActive.current && !telemetry.brewerRunning && elapsed > 10) ||
      elapsed >= brewEstimate.totalTime + 15
    ) {
      setBrewing(false);
      setBrewComplete(true);
    }
  }, [
    brewing,
    brewTimingStarted,
    elapsed,
    brewEstimate.totalTime,
    telemetry.brewerRunning,
    telemetry.state,
  ]);
  useEffect(() => {
    if (!brewComplete || brewRecorded.current) return;
    brewRecorded.current = true;
    const last = samples.at(-1);
    const record: BrewRecord = {
      id: Date.now(),
      recipeName: selected.name,
      completedAt: new Date().toISOString(),
      duration: elapsed,
      water: last?.water || 0,
      coffee: last?.coffee || 0,
      steps: selected.pours.length,
    };
    setHistory((current) => {
      const next = [record, ...current].slice(0, 100);
      localStorage.setItem("xbloom-history", JSON.stringify(next));
      return next;
    });
  }, [brewComplete, elapsed, samples, selected.name, selected.pours.length]);

  function updateRecipe(patch: Partial<Recipe>) {
    setRecipeDirty(true);
    setRecipes((list) => list.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)));
  }
  function saveRecipeChanges() {
    localStorage.setItem("xbloom-recipes", JSON.stringify(recipes));
    savedRecipes.current = structuredClone(recipes);
    setRecipeDirty(false);
  }
  function saveBeans(next: Bean[]) {
    setBeans(next);
    localStorage.setItem("xbloom-beans", JSON.stringify(next));
  }
  function selectBeanForAI(id: number) {
    const bean = beans.find((b) => b.id === id);
    setSelectedBeanId(id);
    if (bean) setAiBean({ ...bean });
  }
  function saveCurrentBean() {
    const bean = {
      ...aiBean,
      id: aiBean.id || Date.now(),
      name: aiBean.name.trim() || `${aiBean.country || "My"} coffee`,
    };
    const next = beans.some((b) => b.id === bean.id)
      ? beans.map((b) => (b.id === bean.id ? bean : b))
      : [...beans, bean];
    saveBeans(next);
    setAiBean(bean);
    setSelectedBeanId(bean.id);
  }
  function openBeanEditor(bean?: Bean) {
    setAiBean(bean ? { ...bean } : blankBean());
    setSelectedBeanId(bean?.id || null);
    setBeanEditor(true);
  }
  function saveBeanEditor() {
    saveCurrentBean();
    setBeanEditor(false);
  }
  function openAI(mode: "create" | "enhance", bean?: Bean) {
    setAiResult(null);
    setAiError("");
    setAiFeedback("");
    const linked = bean || beans.find((b) => b.id === selected.beanId);
    if (linked) {
      setAiBean({ ...linked });
      setSelectedBeanId(linked.id);
      setAiMode(mode);
    } else if (mode === "enhance" && selected.bean) {
      setAiBean({ ...blankBean(), ...selected.bean });
      setSelectedBeanId(null);
      setAiMode(mode);
    } else if (beans.length) {
      setAiBean({ ...beans[0] });
      setSelectedBeanId(beans[0].id);
      setAiMode(mode);
    } else {
      setNav("Beans");
      setConnectionError("Add a bean first, then create an AI recipe from its card.");
    }
  }
  async function runAI() {
    setAiLoading(true);
    setAiElapsed(0);
    setAiError("");
    setAiResult(null);
    const beanForAI = {
      ...aiBean,
      cups: aiBean.cups || 1,
      dose: undefined,
      target_water: undefined,
    };
    try {
      setAiResult(
        aiMode === "enhance"
          ? await xbloomApi.enhanceRecipe({
              bean: beanForAI,
              recipe: selected,
              feedback: aiFeedback,
              rating: aiRating,
            })
          : await xbloomApi.generateRecipe(beanForAI),
      );
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI recipe generation failed.");
    } finally {
      setAiLoading(false);
    }
  }
  useEffect(() => {
    if (!aiLoading) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setAiElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [aiLoading]);
  function saveAIRecipe() {
    if (!aiResult) return;
    const total = aiResult.pours.reduce((sum, p) => sum + p.volume, 0);
    const id = Date.now();
    const sourceBean = aiBean;
    const recipe: Recipe = {
      id,
      name: `${sourceBean.name || "Coffee"} — ${aiResult.name}`,
      roaster: sourceBean.roaster || "AI generated",
      origin:
        [sourceBean.country, sourceBean.region].filter(Boolean).join(" · ") || "AI coffee profile",
      temp: aiResult.pours[0].temp,
      ratio: `1:${(total / aiResult.dose).toFixed(1)}`,
      duration: formatTime(
        Math.round(aiResult.pours.reduce((sum, p) => sum + p.volume / p.flow + p.pauseAfter, 0)),
      ),
      color: aiMode === "enhance" ? selected.color : "#8aa76b",
      grind: aiResult.grind,
      rpm: aiResult.rpm,
      dose: aiResult.dose,
      unit: "ml",
      useGrinder: true,
      bean: sourceBean,
      beanId: selectedBeanId || undefined,
      pours: aiResult.pours.map((p, i) => ({ ...p, pauseBefore: i === 0 ? 5 : 0 })),
    };
    const next = [...recipes, recipe];
    setRecipes(next);
    savedRecipes.current = structuredClone(next);
    localStorage.setItem("xbloom-recipes", JSON.stringify(next));
    setSelectedId(id);
    setRecipeDirty(false);
    setAiMode(null);
    setAiResult(null);
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
      pours: selected.pours.map((p, i) => (i === index ? { ...p, ...patch } : p)),
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
          error instanceof Error ? error.message : "Could not disconnect from xBloom.",
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
      setConnectionError(error instanceof Error ? error.message : "Could not connect to xBloom.");
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
      setConnectionError(error instanceof Error ? error.message : "Brew could not start.");
    }
  }
  async function stopBrew() {
    try {
      await xbloomApi.stop();
      setBrewing(false);
      setNav("Home");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not stop.");
    }
  }

  return {
    connected,
    scanning,
    connectionError,
    setConnectionError,
    waterAlert,
    setWaterAlert,
    telemetry,
    recipes,
    setRecipes,
    savedRecipes,
    recipeDirty,
    setRecipeDirty,
    aiMode,
    setAiMode,
    aiLoading,
    aiElapsed,
    aiError,
    aiResult,
    setAiResult,
    aiFeedback,
    setAiFeedback,
    aiRating,
    setAiRating,
    beans,
    aiBean,
    setAiBean,
    selectedBeanId,
    beanEditor,
    setBeanEditor,
    selectedId,
    setSelectedId,
    selected,
    machineName,
    setMachineName,
    brewing,
    progress,
    elapsed,
    samples,
    brewComplete,
    brewTimingStarted,
    history,
    nav,
    setNav,
    navItems,
    brewEstimate,
    updateRecipe,
    saveRecipeChanges,
    saveBeans,
    selectBeanForAI,
    openBeanEditor,
    saveBeanEditor,
    openAI,
    runAI,
    saveAIRecipe,
    selectRecipe,
    updatePour,
    addPour,
    removePour,
    newRecipe,
    removeRecipe,
    toggleConnection,
    startBrew,
    stopBrew,
  };
}

export type AppController = ReturnType<typeof useAppController>;
