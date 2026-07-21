import type { CSSProperties } from "react";

export const grindLabel = (value: number) =>
  value <= 15
    ? "Espresso"
    : value <= 30
      ? "AeroPress"
      : value <= 55
        ? "Pour-over coffee maker"
        : "French press · Cold brew";

export function RangeBox({
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
      style={{ "--range-fill": `${fill}%` } as CSSProperties}
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
