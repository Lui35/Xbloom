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
  infused_with?: string;
  altitude_masl?: number;
  roast_level?: string;
  roast_date?: string;
  tasting_notes?: string;
  desired_cup?: string;
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
      throw new Error("Gemini took too long to respond. Please try generating again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
export const xbloomApi = {
  health: () => call<{ ok: boolean }>("/health"),
  connect: () => call<MachineStatus>("/connect", { method: "POST", body: "{}" }),
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
};
