import { useEffect, useRef } from "react";
import type { PourPattern } from "../domain/models";

export function PatternGlyph({ pattern, active }: { pattern: PourPattern; active: boolean }) {
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
