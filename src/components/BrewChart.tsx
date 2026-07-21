import { useEffect, useRef } from "react";
import type { BrewSample } from "../domain/models";

export function BrewChart({ samples, totalTime }: { samples: BrewSample[]; totalTime: number }) {
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
    const maxTime = Math.max(60, totalTime, samples.at(-1)?.time || 60),
      maxValue = Math.max(100, ...samples.flatMap((s) => [s.water, s.coffee]));
    (["water", "coffee"] as const).forEach((metric) => {
      const color = metric === "water" ? "#68a8ff" : "#d9ff62";
      let filtered = samples[0][metric];
      const points = samples.map((s) => {
        filtered = filtered * 0.72 + s[metric] * 0.28;
        return {
          x: 52 + (s.time / maxTime) * (w - 86),
          y: 20 + (1 - filtered / maxValue) * (h - 48),
        };
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
        const midX = (points[i].x + points[i + 1].x) / 2,
          midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const last = points.at(-1)!,
        before = points.at(-2)!;
      ctx.quadraticCurveTo(before.x, before.y, last.x, last.y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }, [samples, totalTime]);
  return (
    <canvas
      className="brew-chart"
      ref={canvas}
      aria-label="Live chart of water poured and coffee collected"
    />
  );
}
