import { Coffee, Plus, Thermometer, Waves, Weight } from "lucide-react";
import type { AppController } from "../controllers/useAppController";
import { formatTime } from "../domain/brewing";

export function HomePage({ controller }: { controller: AppController }) {
  const {
    nav,
    selected,
    telemetry,
    connected,
    startBrew,
    brewing,
    progress,
    elapsed,
    stopBrew,
    history,
    recipes,
    selectRecipe,
    newRecipe,
    setNav,
    connectionError,
    machineName,
  } = controller;
  return (
    <div className={nav === "Home" ? "home-content" : "home-content hidden"}>
      <section className="hero-grid">
        <article className="brew-card">
          <div className="brew-top">
            <div>
              <p className="eyebrow">READY TO BREW</p>
              <h2>{selected.name}</h2>
              <p>
                {selected.roaster} · {selected.origin}
              </p>
            </div>
            <button className="ghost" onClick={() => setNav("Recipes")}>
              Edit recipe
            </button>
          </div>
          <div className="brew-visual">
            <div className="orbit one" />
            <div className="orbit two" />
            <div className="cup">
              <Coffee size={42} />
              <span>{selected.dose}g</span>
            </div>
          </div>
          <div className="metrics">
            <div>
              <Thermometer />
              <span>
                <b>{telemetry.temperature?.toFixed(1) ?? selected.temp}°</b>C
              </span>
            </div>
            <div>
              <Weight />
              <span>
                <b>{telemetry.weight?.toFixed(1) ?? "288"}</b>g{" "}
                {telemetry.weight === undefined ? "water" : "scale"}
              </span>
            </div>
            <div>
              <Waves />
              <span>
                <b>{selected.duration}</b> total
              </span>
            </div>
          </div>
          <button
            className={brewing ? "primary stop" : "primary"}
            onClick={brewing ? stopBrew : startBrew}
          >
            {brewing
              ? `Stop brew · ${formatTime(elapsed)}`
              : connected
                ? "Start brew"
                : "Connect & brew"}
            <span>{brewing ? "■" : "→"}</span>
          </button>
          {connectionError && (
            <p className="brew-error" role="alert">
              {connectionError}
            </p>
          )}
        </article>

        <div className="right-column">
          <article className="machine-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">YOUR MACHINE</p>
                <h3>{machineName}</h3>
              </div>
              <div className="status-dot" data-on={connected} />
            </div>
            <div className="machine-photo">
              <img
                src="/xbloom-studio-cutout.png"
                alt="Midnight Black xBloom Studio brewing coffee"
              />
            </div>
            <div className="machine-stats">
              <span>
                Water{" "}
                <b>
                  {telemetry.waterVolume !== undefined
                    ? `${Math.round(telemetry.waterVolume)} ml`
                    : "—"}
                </b>
              </span>
              <span>
                Machine <b>{connected ? telemetry.state : "offline"}</b>
              </span>
            </div>
          </article>
          <article className="last-brew">
            <p className="eyebrow">LAST BREW</p>
            {history[0] ? (
              <>
                <div>
                  <strong>{history[0].recipeName}</strong>
                  <span>{new Date(history[0].completedAt).toLocaleString()}</span>
                </div>
                <b className="last-duration">{formatTime(history[0].duration)}</b>
              </>
            ) : (
              <>
                <div>
                  <strong>No completed brews</strong>
                  <span>Complete a brew to begin</span>
                </div>
                <b className="last-duration">—</b>
              </>
            )}
          </article>
        </div>
      </section>

      <section className="recipes">
        <div className="section-title">
          <div>
            <p className="eyebrow">YOUR LIBRARY</p>
            <h2>Saved recipes</h2>
          </div>
          <button onClick={newRecipe}>
            <Plus size={17} /> New recipe
          </button>
        </div>
        <div className="recipe-row">
          {recipes.map((r) => (
            <button
              key={r.id}
              className={`recipe ${selected.id === r.id ? "selected" : ""}`}
              onClick={() => selectRecipe(r.id)}
            >
              <span className="bean" style={{ background: r.color }} />
              <span>
                <strong>{r.name}</strong>
                <small>{r.origin}</small>
              </span>
              <b>Grind {r.grind}</b>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
