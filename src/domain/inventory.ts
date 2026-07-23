import type { Bean } from "./models";

export const DEFAULT_BEAN_WEIGHT_GRAMS = 250;

export function beanInitialWeight(bean: Bean): number {
  const initial = Number(bean.initialWeightGrams);
  return Number.isFinite(initial) && initial > 0 ? initial : DEFAULT_BEAN_WEIGHT_GRAMS;
}

export function beanRemainingWeight(bean: Bean): number {
  const initial = beanInitialWeight(bean);
  const remaining = Number(bean.remainingWeightGrams);

  // Older/custom bean records can contain zero for both fields even though the
  // inventory card historically displayed those records as a full 250 g bag.
  if (remaining === 0 && Number(bean.initialWeightGrams) <= 0) return initial;
  return Number.isFinite(remaining) && remaining >= 0 ? remaining : initial;
}

export function normalizeBeanInventory(bean: Bean): Bean {
  return {
    ...bean,
    initialWeightGrams: beanInitialWeight(bean),
    remainingWeightGrams: beanRemainingWeight(bean),
  };
}

export function deductBeanDose(bean: Bean, dose: number): Bean {
  const normalized = normalizeBeanInventory(bean);
  const validDose = Number.isFinite(dose) && dose > 0 ? dose : 0;
  return {
    ...normalized,
    remainingWeightGrams: Math.max(0, normalized.remainingWeightGrams! - validDose),
  };
}
