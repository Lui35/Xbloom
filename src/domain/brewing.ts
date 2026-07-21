import type { BrewEstimate, Recipe } from "./models";

export function estimateBrew(recipe: Recipe, elapsed: number): BrewEstimate {
  const totalTime = recipe.pours.reduce((sum, p) => sum + p.volume / p.flow + p.pauseAfter, 0);
  let cursor = elapsed;
  let water = 0;
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
      return { water, step: i, phase: "Resting after pour", complete: false, totalTime };
    cursor -= pour.pauseAfter;
  }
  return { water, step: recipe.pours.length - 1, phase: "Complete", complete: true, totalTime };
}

export const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
