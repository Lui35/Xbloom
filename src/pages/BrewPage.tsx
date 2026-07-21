import { Waves } from "lucide-react";
import type { AppController } from "../controllers/useAppController";
import { BrewChart } from "../components/BrewChart";
import { PatternGlyph } from "../components/PatternGlyph";
import { formatTime } from "../domain/brewing";

export function BrewPage({ controller }: { controller: AppController }) {
  const {
    brewComplete,
    brewTimingStarted,
    brewEstimate,
    selected,
    elapsed,
    samples,
    brewing,
    connected,
    stopBrew,
    setNav,
  } = controller;
  return (
    <section className="brew-session">
      <div className="session-heading">
        <div>
          <p className="eyebrow">{brewComplete ? "BREW COMPLETE" : "LIVE BREW"}</p>
          <h2>{selected.name}</h2>
          <p>
            {brewComplete
              ? "Your cup is ready."
              : brewTimingStarted
                ? brewEstimate.phase
                : selected.useGrinder
                  ? "Grinding, settling & positioning"
                  : "Settling & positioning"}
          </p>
        </div>
        <span className={brewComplete ? "session-state complete" : "session-state"}>
          {brewComplete
            ? "Complete"
            : brewTimingStarted
              ? `Step ${brewEstimate.step + 1} of ${selected.pours.length}`
              : "Preparing"}
        </span>
      </div>
      <div className="session-stats">
        <div>
          <small>ELAPSED</small>
          <strong>{formatTime(elapsed)}</strong>
        </div>
        <div>
          <small>ESTIMATED WATER</small>
          <strong>
            {samples.at(-1)?.water.toFixed(0) || "0"} <i>ml</i>
          </strong>
        </div>
        <div>
          <small>COFFEE COLLECTED</small>
          <strong>
            {samples.at(-1)?.coffee.toFixed(1) || "0.0"} <i>g</i>
          </strong>
        </div>
        <div>
          <small>STEPS REMAINING</small>
          <strong>
            {brewComplete ? 0 : Math.max(0, selected.pours.length - brewEstimate.step - 1)}
          </strong>
        </div>
      </div>
      <article className="graph-card combined-graph">
        <div className="combined-legend">
          <span>
            <i className="graph-dot water" />
            <strong>Water poured</strong>
          </span>
          <span>
            <i className="graph-dot coffee" />
            <strong>Coffee collected</strong>
          </span>
          <small>Live · {formatTime(elapsed)}</small>
        </div>
        <BrewChart samples={samples} totalTime={brewEstimate.totalTime} />
      </article>
      <article className="step-card">
        <div className="step-card-heading">
          <div>
            <p className="eyebrow">BREW TIMELINE</p>
            <h3>
              {brewComplete
                ? "All steps finished"
                : brewTimingStarted
                  ? brewEstimate.phase
                  : "Waiting for water flow"}
            </h3>
          </div>
          <span>{selected.pours.reduce((sum, p) => sum + p.volume, 0)} ml total</span>
        </div>
        <div
          className="pour-bars live-pour-bars"
          style={{ gridTemplateColumns: `repeat(${selected.pours.length}, minmax(0, 1fr))` }}
        >
          {selected.pours.map((p, i) => {
            const state =
              brewComplete || (brewTimingStarted && i < brewEstimate.step)
                ? "done"
                : brewTimingStarted && i === brewEstimate.step
                  ? "current"
                  : "upcoming";
            return (
              <article
                className={`live-pour ${state}`}
                key={i}
                style={{ height: `${Math.max(185, 150 + p.volume * 1.35)}px` }}
              >
                <header>
                  <b>{state === "done" ? "✓" : i + 1}</b>
                  <strong>
                    {p.volume}
                    <small>ml</small>
                  </strong>
                </header>
                <div className="summary-pattern">
                  <PatternGlyph pattern={p.pattern} active={state === "current"} />
                  <strong>{p.temp}°C</strong>
                </div>
                <span className="summary-step-name">{i === 0 ? "Bloom" : `Pour ${i + 1}`}</span>
                <div className="summary-facts">
                  <span>
                    {p.pauseAfter}
                    <small>sec</small>
                  </span>
                </div>
                {(p.agitationBefore || p.agitationAfter) && (
                  <div className="live-agitations">
                    {p.agitationBefore && (
                      <span
                        className="before"
                        title="Agitation before"
                        aria-label="Agitation before"
                      >
                        <Waves size={13} />
                      </span>
                    )}
                    {p.agitationAfter && (
                      <span className="after" title="Agitation after" aria-label="Agitation after">
                        <Waves size={13} />
                      </span>
                    )}
                  </div>
                )}
                <span className="live-step-state">
                  {!brewTimingStarted
                    ? "Waiting"
                    : state === "current"
                      ? brewEstimate.phase
                      : state === "done"
                        ? "Done"
                        : "Waiting"}
                </span>
              </article>
            );
          })}
        </div>
      </article>
      {brewing ? (
        <button className="primary stop session-action" onClick={stopBrew}>
          Stop brew · {formatTime(elapsed)}
          <span>■</span>
        </button>
      ) : (
        <button className="primary session-action" onClick={() => setNav("Home")}>
          {brewComplete ? "Done" : "Back to home"}
          <span>→</span>
        </button>
      )}
      {!connected && brewing && (
        <p className="session-note">
          Machine connection was lost. Water remains estimated from the recipe timeline.
        </p>
      )}
    </section>
  );
}
