export type MachineStatus = {
  connected: boolean;
  state: string;
  address?: string;
  weight?: number;
  temperature?: number;
  waterLevelOk?: boolean;
  waterVolume?: number;
  grinderRunning?: boolean;
  brewerRunning?: boolean;
  model?: string;
};
export type AIBeanProfile = {
  brew_style: "hot" | "iced" | "cold";
  cups?: 1 | 2 | 3;
  brewer: string;
  dose?: number;
  target_water?: number;
  country?: string;
  region?: string;
  producer?: string;
  species?: string;
  variety?: string;
  process?: string;
  bean_size?: string;
  acidity?: 1 | 2 | 3 | 4 | 5;
  process_detail?: string;
  /** Legacy field retained so previously saved beans can be migrated. */
  infused_with?: string;
  altitude_masl?: number;
  roast_level?: string;
  roast_date?: string;
  tasting_notes?: string;
  desired_cup?: string;
  recipe_goals?: string[];
  ai_choose_goals?: boolean;
  user_preferences?: string[];
};
export type AIRecipeResult = {
  name: string;
  rationale: string;
  brew_style: "hot" | "iced" | "cold";
  ice_grams: number;
  grind: number;
  rpm: 60 | 70 | 80 | 90 | 100 | 110 | 120;
  dose: number;
  pours: Array<{
    volume: number;
    temp: number;
    flow: number;
    pauseAfter: number;
    pattern: "center" | "circular" | "spiral";
    agitationBefore: boolean;
    agitationAfter: boolean;
  }>;
};
export type AIBeanPhotoResult = Omit<AIBeanProfile, "brew_style" | "brewer" | "cups"> & {
  name: string;
  roaster?: string;
  confidence: Record<string, number>;
};
const API = "http://127.0.0.1:8766/api";

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(body.detail || "Request failed");
    }
    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("The xBloom API took too long to respond. Please try again.");
    if (error instanceof TypeError)
      throw new Error(
        "The xBloom API is not running on port 8766. Start the native API for Bluetooth machine control.",
      );
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
export const xbloomApi = {
  health: () => call<{ ok: boolean }>("/health"),
  connect: () => call<MachineStatus>("/connect", { method: "POST", body: "{}" }),
  openBluetoothSettings: () =>
    call<{ opened: boolean }>("/bluetooth/settings", { method: "POST", body: "{}" }),
  disconnect: () => call<MachineStatus>("/disconnect", { method: "POST" }),
  status: () => call<MachineStatus>("/status"),
  stop: () => call<{ stopped: boolean }>("/stop", { method: "POST" }),
  brew: (recipe: unknown) =>
    call<{ started: boolean }>("/brew", { method: "POST", body: JSON.stringify(recipe) }),
  generateRecipe: (bean: AIBeanProfile) =>
    call<AIRecipeResult>("/ai/generate-recipe", { method: "POST", body: JSON.stringify(bean) }),
  enhanceRecipe: (payload: {
    bean?: AIBeanProfile;
    recipe: unknown;
    feedback: string;
    rating?: number;
  }) =>
    call<AIRecipeResult>("/ai/enhance-recipe", { method: "POST", body: JSON.stringify(payload) }),
  importBeanPhoto: (payload: { images: Array<{ image_base64: string; mime_type: string }> }) =>
    call<AIBeanPhotoResult>("/ai/import-bean-photo", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  loadData: () => call<{ beans: unknown[]; recipes: unknown[]; history: unknown[] }>("/data"),
  saveData: (payload: { beans: unknown[]; recipes: unknown[]; history: unknown[] }) =>
    call<{ saved: boolean }>("/data", { method: "PUT", body: JSON.stringify(payload) }),
};
