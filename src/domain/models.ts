import type { AIBeanProfile } from "../api";

export type PourPattern = "spiral" | "center" | "circular";
export type GrinderRpm = 60 | 70 | 80 | 90 | 100 | 110 | 120;

export type Pour = {
  volume: number;
  temp: number;
  flow: number;
  pauseBefore: number;
  pauseAfter: number;
  pattern: PourPattern;
  agitationBefore: boolean;
  agitationAfter: boolean;
};

export type Recipe = {
  id: number;
  name: string;
  roaster: string;
  origin: string;
  temp: number;
  ratio: string;
  duration: string;
  color: string;
  grind: number;
  rpm: GrinderRpm;
  dose: number;
  unit: "g" | "ml";
  useGrinder: boolean;
  bean?: AIBeanProfile;
  beanId?: number;
  pours: Pour[];
};

export type Bean = AIBeanProfile & { id: number; name: string; roaster?: string };
export type BrewSample = { time: number; water: number; coffee: number };
export type BrewRecord = {
  id: number;
  recipeName: string;
  completedAt: string;
  duration: number;
  water: number;
  coffee: number;
  steps: number;
};
export type BrewEstimate = {
  water: number;
  step: number;
  phase: string;
  complete: boolean;
  totalTime: number;
};
