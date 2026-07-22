import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, History, LayoutDashboard, Library, Settings } from "lucide-react";
import { AIRecipeResult, GeminiModel, MachineStatus, xbloomApi } from "../api";
import type { Bean, BrewRecord, BrewSample, Pour, Recipe } from "../domain/models";
import { blankBean, initialRecipes } from "../domain/recipes";
import { estimateBrew, formatTime } from "../domain/brewing";

const NAV_ROUTES: Record<string, string> = {
  Home: "/home",
  Recipes: "/recipes",
  Beans: "/beans",
  History: "/history",
  Settings: "/settings",
  Brew: "/brew",
};

function navFromPath(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return Object.entries(NAV_ROUTES).find(([, path]) => path === normalized)?.[0] || "Home";
}

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
          brewStyle: r.brewStyle || "hot",
          iceGrams: r.iceGrams || 0,
          generatedByAI: r.generatedByAI ?? Boolean(r.beanId && r.bean),
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
  const [aiChooseGoals, setAiChooseGoals] = useState(true);
  const [aiRecipeGoals, setAiRecipeGoals] = useState<string[]>([]);
  const [tastePreferences, setTastePreferences] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("xbloom-taste-preferences") || "[]");
    } catch {
      return [];
    }
  });
  const [beans, setBeans] = useState<Bean[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("xbloom-beans") || "[]").map((bean: Bean) => ({
        ...bean,
        process_detail: bean.process_detail || bean.infused_with || "",
      }));
    } catch {
      return [];
    }
  });
  const [aiBean, setAiBean] = useState<Bean>(blankBean);
  const [selectedBeanId, setSelectedBeanId] = useState<number | null>(null);
  const [beanEditor, setBeanEditor] = useState(false);
  const [beanPhotoLoading, setBeanPhotoLoading] = useState(false);
  const [beanPhotoError, setBeanPhotoError] = useState("");
  const [libraryMessage, setLibraryMessage] = useState("");
  const [recipeTransferMessage, setRecipeTransferMessage] = useState("");
  const [dataHydrated, setDataHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState(1);
  const selected = recipes.find((r) => r.id === selectedId) || recipes[0];
  const [machineName, setMachineName] = useState(
    () => localStorage.getItem("xbloom-machine-name") || "xBloom Studio",
  );
  const [geminiModel, setGeminiModelState] = useState<GeminiModel>(() => {
    const saved = localStorage.getItem("xbloom-gemini-model");
    return [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ].includes(saved || "")
      ? (saved as GeminiModel)
      : "gemini-3.6-flash";
  });
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
  const [nav, setNavState] = useState(() => navFromPath(window.location.pathname));
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
    let active = true;
    void xbloomApi
      .loadData()
      .then((data) => {
        if (!active) return;
        if (data.beans.length) setBeans(data.beans as Bean[]);
        if (data.recipes.length) {
          const loaded = data.recipes as Recipe[];
          setRecipes(loaded);
          savedRecipes.current = structuredClone(loaded);
          setSelectedId(loaded[0].id);
        }
        if (data.history.length) setHistory(data.history as BrewRecord[]);
        setDataHydrated(true);
      })
      .catch(() => setDataHydrated(true));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dataHydrated) return;
    const timer = window.setTimeout(() => {
      void xbloomApi.saveData({ beans, recipes: savedRecipes.current, history });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [beans, recipes, history, dataHydrated]);

  function applyNavigation(next: string, updateUrl: boolean) {
    if (nav === "Recipes" && next !== "Recipes" && recipeDirty) {
      setRecipes(structuredClone(savedRecipes.current));
      setRecipeDirty(false);
    }
    if (beanEditor) {
      setBeanEditor(false);
      setAiBean(blankBean());
      setSelectedBeanId(null);
    }
    setNavState(next);
    const route = NAV_ROUTES[next] || NAV_ROUTES.Home;
    if (updateUrl && window.location.pathname !== route) {
      window.history.pushState({ nav: next }, "", route);
    }
  }

  function setNav(next: string) {
    applyNavigation(next, true);
  }

  useEffect(() => {
    const initialNav = navFromPath(window.location.pathname);
    const canonicalRoute = NAV_ROUTES[initialNav];
    if (window.location.pathname !== canonicalRoute) {
      window.history.replaceState({ nav: initialNav }, "", canonicalRoute);
    }
  }, []);
  useEffect(() => {
    const handlePopState = () => applyNavigation(navFromPath(window.location.pathname), false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  });
  useEffect(() => {
    document.title = `${nav} · xBloom`;
  }, [nav]);
  useEffect(() => {
    if (!connected) return;
    const guardConnectedMachine = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guardConnectedMachine);
    return () => window.removeEventListener("beforeunload", guardConnectedMachine);
  }, [connected]);

  useEffect(() => {
    if (!libraryMessage) return;
    const timer = window.setTimeout(() => setLibraryMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [libraryMessage]);
  useEffect(() => {
    if (!recipeTransferMessage) return;
    const timer = window.setTimeout(() => setRecipeTransferMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [recipeTransferMessage]);
  useEffect(() => {
    if (!beanPhotoError) return;
    const timer = window.setTimeout(() => setBeanPhotoError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [beanPhotoError]);

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
      recipeId: selected.id,
      beanId: selected.beanId,
      beanName: beans.find((bean) => bean.id === selected.beanId)?.name,
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
    if (selected.beanId) {
      setBeans((current) => {
        const next = current.map((bean) =>
          bean.id === selected.beanId
            ? {
                ...bean,
                remainingWeightGrams: Math.max(
                  0,
                  (bean.remainingWeightGrams ?? bean.initialWeightGrams ?? 0) - selected.dose,
                ),
              }
            : bean,
        );
        try {
          localStorage.setItem("xbloom-beans", JSON.stringify(next));
        } catch {
          /* Photos may exceed browser storage; SQLite remains authoritative. */
        }
        return next;
      });
    }
  }, [brewComplete, elapsed, samples, selected, beans]);

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
    try {
      localStorage.setItem("xbloom-beans", JSON.stringify(next));
    } catch {
      /* Package photos are persisted in SQLite when browser storage is full. */
    }
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
  async function importBeanPhoto(files: File[], bagWeight = 250) {
    if (
      !files.length ||
      files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    ) {
      setBeanPhotoError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setBeanPhotoError("Each image must be smaller than 10 MB.");
      return;
    }
    setBeanPhotoLoading(true);
    setBeanPhotoError("");
    try {
      const dataUrls = await Promise.all(
        files.slice(0, 2).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("An image could not be opened."));
              reader.readAsDataURL(file);
            }),
        ),
      );
      const scanned = await xbloomApi.importBeanPhoto({
        images: dataUrls.map((dataUrl, index) => ({
          image_base64: dataUrl.split(",", 2)[1],
          mime_type: files[index].type,
        })),
      }, geminiModel);
      const importedBean: Bean = {
        ...blankBean(),
        ...scanned,
        id: Date.now(),
        name: scanned.name || files[0].name.replace(/\.[^.]+$/, ""),
        packagePhotos: { front: dataUrls[0], back: dataUrls[1] },
        aiConfidence: scanned.confidence,
        initialWeightGrams: bagWeight,
        remainingWeightGrams: bagWeight,
      };
      saveBeans([...beans, importedBean]);
      setAiBean(importedBean);
      setSelectedBeanId(importedBean.id);
    } catch (error) {
      setBeanPhotoError(
        error instanceof Error ? error.message : "The coffee label could not be read.",
      );
    } finally {
      setBeanPhotoLoading(false);
    }
  }
  function exportLibrary() {
    const backup = {
      format: "xbloom-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: savedRecipes.current,
      beans,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `xbloom-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setLibraryMessage(`Exported ${beans.length} beans and ${savedRecipes.current.length} recipes.`);
  }
  async function importLibrary(file: File) {
    setLibraryMessage("");
    try {
      const data = JSON.parse(await file.text()) as { recipes?: unknown; beans?: unknown };
      if (!Array.isArray(data.recipes) && !Array.isArray(data.beans))
        throw new Error("This file does not contain an xBloom recipe or bean library.");
      const now = Date.now();
      const beanIdMap = new Map<number, number>();
      const importedBeans = (Array.isArray(data.beans) ? data.beans : [])
        .slice(0, 500)
        .filter((bean): bean is Bean => Boolean(bean && typeof bean === "object" && "name" in bean))
        .map((bean, index) => {
          const id = now + index;
          beanIdMap.set(bean.id, id);
          return {
            ...blankBean(),
            ...bean,
            id,
            name: String(bean.name).slice(0, 100),
          };
        });
      const importedRecipes = (Array.isArray(data.recipes) ? data.recipes : [])
        .slice(0, 500)
        .filter((recipe): recipe is Recipe =>
          Boolean(
            recipe &&
            typeof recipe === "object" &&
            "name" in recipe &&
            "pours" in recipe &&
            Array.isArray((recipe as Recipe).pours) &&
            (recipe as Recipe).pours.length,
          ),
        )
        .map((recipe, index) => ({
          ...initialRecipes[0],
          ...recipe,
          id: now + importedBeans.length + index,
          name: String(recipe.name).slice(0, 100),
          beanId: recipe.beanId ? beanIdMap.get(recipe.beanId) : undefined,
          pours: recipe.pours.slice(0, 8).map((pour, pourIndex) => ({
            volume: Math.max(0, Math.min(240, Number(pour.volume) || 0)),
            temp: Math.max(80, Math.min(96, Number(pour.temp) || 93)),
            flow: Math.max(3, Math.min(3.5, Number(pour.flow) || 3.2)),
            pauseBefore: pourIndex === 0 ? 5 : 0,
            pauseAfter: Math.max(0, Math.min(60, Number(pour.pauseAfter) || 0)),
            pattern: ["center", "circular", "spiral"].includes(pour.pattern)
              ? pour.pattern
              : "spiral",
            agitationBefore: Boolean(pour.agitationBefore),
            agitationAfter: Boolean(pour.agitationAfter),
          })),
        }));
      if (!importedBeans.length && !importedRecipes.length)
        throw new Error("No valid beans or recipes were found in this file.");
      const nextBeans = [...beans, ...importedBeans];
      const nextRecipes = [...savedRecipes.current, ...importedRecipes];
      saveBeans(nextBeans);
      setRecipes(nextRecipes);
      savedRecipes.current = structuredClone(nextRecipes);
      localStorage.setItem("xbloom-recipes", JSON.stringify(nextRecipes));
      setRecipeDirty(false);
      if (importedRecipes[0]) setSelectedId(importedRecipes[0].id);
      setLibraryMessage(
        `Imported ${importedBeans.length} beans and ${importedRecipes.length} recipes.`,
      );
    } catch (error) {
      setLibraryMessage(
        error instanceof Error ? error.message : "The library could not be imported.",
      );
    }
  }
  function openAI(mode: "create" | "enhance", bean?: Bean) {
    setAiResult(null);
    setAiError("");
    setAiFeedback("");
    setAiChooseGoals(true);
    setAiRecipeGoals([]);
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
  function enhanceFromHistory(record: BrewRecord) {
    const recipe = recipes.find((item) => item.id === record.recipeId);
    if (!recipe) {
      setConnectionError("The recipe used for this older brew is no longer available.");
      return;
    }
    const bean = beans.find((item) => item.id === record.beanId || item.id === recipe.beanId);
    setSelectedId(recipe.id);
    setAiBean(bean ? { ...bean } : { ...blankBean(), ...(recipe.bean || {}) });
    setSelectedBeanId(bean?.id || null);
    setAiResult(null);
    setAiError("");
    setAiFeedback("");
    setAiRating(4);
    setAiMode("enhance");
  }
  async function runAI() {
    setAiLoading(true);
    setAiElapsed(0);
    setAiError("");
    setAiResult(null);
    const beanForAI = {
      ...aiBean,
      brew_style: aiMode === "enhance" ? selected.brewStyle : aiBean.brew_style,
      cups: aiBean.cups || 1,
      dose: undefined,
      target_water: undefined,
      recipe_goals: aiChooseGoals ? [] : aiRecipeGoals,
      ai_choose_goals: aiChooseGoals,
      user_preferences: tastePreferences,
    };
    try {
      setAiResult(
        aiMode === "enhance"
          ? await xbloomApi.enhanceRecipe({
              bean: beanForAI,
              recipe: selected,
              feedback: aiFeedback,
              rating: aiRating,
            }, geminiModel)
          : await xbloomApi.generateRecipe(beanForAI, geminiModel),
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
    const ratioWater = total + (aiResult.brew_style === "iced" ? aiResult.ice_grams : 0);
    const id = Date.now();
    const sourceBean = aiBean;
    const recipe: Recipe = {
      id,
      name: `${sourceBean.name || "Coffee"} — ${aiResult.name}`,
      roaster: sourceBean.roaster || "AI generated",
      origin:
        [sourceBean.country, sourceBean.region].filter(Boolean).join(" · ") || "AI coffee profile",
      temp: aiResult.pours[0].temp,
      ratio: `1:${(ratioWater / aiResult.dose).toFixed(1)}`,
      duration: formatTime(
        Math.round(aiResult.pours.reduce((sum, p) => sum + p.volume / p.flow + p.pauseAfter, 0)),
      ),
      color: aiMode === "enhance" ? selected.color : "#8aa76b",
      grind: aiResult.grind,
      rpm: aiResult.rpm,
      dose: aiResult.dose,
      unit: "ml",
      useGrinder: true,
      brewStyle: aiResult.brew_style,
      iceGrams: aiResult.ice_grams,
      bean: sourceBean,
      beanId: selectedBeanId || undefined,
      generatedByAI: true,
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
  function exportSelectedRecipe() {
    const payload = {
      format: "xbloom-recipe",
      version: 1,
      exportedAt: new Date().toISOString(),
      recipe: selected,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      selected.name
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "xbloom-recipe"
    }.json`;
    link.click();
    URL.revokeObjectURL(url);
    setRecipeTransferMessage(`Exported “${selected.name}”.`);
  }
  async function importRecipe(file: File) {
    setRecipeTransferMessage("");
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      const candidate = data.recipe && typeof data.recipe === "object" ? data.recipe : data;
      const raw = candidate as Partial<Recipe>;
      if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.pours) || !raw.pours.length)
        throw new Error("This file does not contain a valid xBloom recipe.");
      const id = Date.now();
      const recipe: Recipe = {
        ...initialRecipes[0],
        ...raw,
        id,
        name: raw.name.slice(0, 100),
        pours: raw.pours.slice(0, 8).map((pour, index) => ({
          volume: Math.max(0, Math.min(240, Number(pour.volume) || 0)),
          temp: Math.max(80, Math.min(96, Number(pour.temp) || 93)),
          flow: Math.max(3, Math.min(3.5, Number(pour.flow) || 3.2)),
          pauseBefore: index === 0 ? 5 : 0,
          pauseAfter: Math.max(0, Math.min(60, Number(pour.pauseAfter) || 0)),
          pattern: ["center", "circular", "spiral"].includes(pour.pattern)
            ? pour.pattern
            : "spiral",
          agitationBefore: Boolean(pour.agitationBefore),
          agitationAfter: Boolean(pour.agitationAfter),
        })),
      };
      const next = [...savedRecipes.current, recipe];
      setRecipes(next);
      savedRecipes.current = structuredClone(next);
      localStorage.setItem("xbloom-recipes", JSON.stringify(next));
      setSelectedId(id);
      setRecipeDirty(false);
      setRecipeTransferMessage(`Imported “${recipe.name}”.`);
    } catch (error) {
      setRecipeTransferMessage(
        error instanceof Error ? error.message : "The recipe could not be imported.",
      );
    }
  }
  function selectRecipe(id: number) {
    if (id === selected.id) return;
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
    const remaining = savedRecipes.current.filter((r) => r.id !== selected.id);
    savedRecipes.current = structuredClone(remaining);
    localStorage.setItem("xbloom-recipes", JSON.stringify(remaining));
    setRecipes(remaining);
    setSelectedId(remaining[0].id);
    setRecipeDirty(false);
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
  async function openBluetoothSettings() {
    try {
      await xbloomApi.openBluetoothSettings();
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not open Bluetooth settings.",
      );
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
    aiChooseGoals,
    setAiChooseGoals,
    aiRecipeGoals,
    setAiRecipeGoals,
    tastePreferences,
    setTastePreferences: (preferences: string[]) => {
      setTastePreferences(preferences);
      localStorage.setItem("xbloom-taste-preferences", JSON.stringify(preferences));
    },
    beans,
    aiBean,
    setAiBean,
    selectedBeanId,
    beanEditor,
    beanPhotoLoading,
    beanPhotoError,
    libraryMessage,
    recipeTransferMessage,
    setBeanEditor,
    selectedId,
    setSelectedId,
    selected,
    machineName,
    setMachineName,
    geminiModel,
    setGeminiModel: (model: GeminiModel) => {
      setGeminiModelState(model);
      localStorage.setItem("xbloom-gemini-model", model);
    },
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
    importBeanPhoto,
    exportLibrary,
    importLibrary,
    exportSelectedRecipe,
    importRecipe,
    enhanceFromHistory,
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
    openBluetoothSettings,
    startBrew,
    stopBrew,
  };
}

export type AppController = ReturnType<typeof useAppController>;
