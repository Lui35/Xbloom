import {
  Download,
  Droplets,
  Plus,
  Save,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Waves,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { AppController } from "../controllers/useAppController";
import type { Recipe } from "../domain/models";
import { PatternGlyph } from "../components/PatternGlyph";
import { RangeBox, grindLabel } from "../components/RangeBox";

export function RecipesPage({ controller }: { controller: AppController }) {
  const {
    recipes,
    selected,
    recipeDirty,
    openAI,
    saveRecipeChanges,
    removeRecipe,
    newRecipe,
    selectRecipe,
    updateRecipe,
    removePour,
    updatePour,
    addPour,
    exportSelectedRecipe,
    importRecipe,
    recipeTransferMessage,
    beans,
  } = controller;
  return (
    <section className="editor-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RECIPE STUDIO</p>
          <h2>Edit your brew</h2>
        </div>
        <div className="recipe-actions">
          <label className="recipe-transfer-button">
            <Upload size={16} /> Import recipe
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importRecipe(file);
                event.target.value = "";
              }}
            />
          </label>
          <button className="recipe-transfer-button" onClick={exportSelectedRecipe}>
            <Download size={16} /> Export recipe
          </button>
          <button className="ai-button" onClick={() => openAI("create")}>
            <Sparkles size={17} /> Create with AI
          </button>
          <button className="save-recipe" onClick={saveRecipeChanges} disabled={!recipeDirty}>
            <Save size={17} /> {recipeDirty ? "Save changes" : "Saved"}
          </button>
          <button className="remove-recipe" onClick={removeRecipe}>
            <Trash2 size={17} /> Remove recipe
          </button>
          <button className="add-button" onClick={newRecipe}>
            <Plus size={17} /> New recipe
          </button>
        </div>
      </div>
      {recipeTransferMessage && <p className="recipe-transfer-message">{recipeTransferMessage}</p>}
      <div className="editor-layout">
        <div className="recipe-list">
          {recipes.map((r) => (
            <button
              className={`recipe-pick recipe-pick-${r.brewStyle} ${r.id === selected.id ? "selected" : ""}`}
              onClick={() => selectRecipe(r.id)}
              key={r.id}
              style={{ "--recipe-accent": r.color } as CSSProperties}
            >
              <span className="recipe-pick-icon">
                {r.brewStyle === "iced" ? (
                  <Snowflake />
                ) : r.brewStyle === "cold" ? (
                  <Droplets />
                ) : (
                  <Sun />
                )}
              </span>
              <span className="recipe-pick-copy">
                <span className="recipe-pick-title">
                  <strong title={r.name}>{r.name}</strong>
                  {r.generatedByAI && (
                    <i className="ai-origin" title="Created with AI" aria-label="Created with AI">
                      <Sparkles /> AI
                    </i>
                  )}
                </span>
                <small>{r.origin || "Custom recipe"}</small>
                <span className="recipe-pick-meta">
                  <i>{r.pours.length} pours</i>
                  <i>1:{Math.round(r.pours.reduce((sum, p) => sum + p.volume, 0) / r.dose)}</i>
                  <i>Grind {r.grind}</i>
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="form-card">
          <div className="form-grid">
            <label>
              Recipe name
              <input
                value={selected.name}
                onChange={(e) => updateRecipe({ name: e.target.value })}
              />
            </label>
            <label>
              Roaster
              <input
                value={selected.roaster}
                onChange={(e) => updateRecipe({ roaster: e.target.value })}
              />
            </label>
            <label className="wide">
              Origin
              <input
                value={selected.origin}
                onChange={(e) => updateRecipe({ origin: e.target.value })}
              />
            </label>
            <label className="wide">
              Bean used
              <select
                value={selected.beanId || ""}
                onChange={(e) => {
                  const beanId = e.target.value ? +e.target.value : undefined;
                  const bean = beans.find((item) => item.id === beanId);
                  updateRecipe({ beanId, bean });
                }}
              >
                <option value="">Not linked to a saved bean</option>
                {beans
                  .filter((bean) => !bean.archived || bean.id === selected.beanId)
                  .map((bean) => (
                    <option value={bean.id} key={bean.id}>
                      {bean.name} ·{" "}
                      {Math.round(bean.remainingWeightGrams ?? bean.initialWeightGrams ?? 0)}g left
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Brew style
              <select
                value={selected.brewStyle}
                onChange={(e) => {
                  const brewStyle = e.target.value as Recipe["brewStyle"];
                  updateRecipe({
                    brewStyle,
                    iceGrams: brewStyle === "iced" ? selected.iceGrams : 0,
                  });
                }}
              >
                <option value="hot">Hot</option>
                <option value="iced">Iced pour-over</option>
                <option value="cold">Cold</option>
              </select>
            </label>
            <label>
              Ice weight (g)
              <input
                type="number"
                min={0}
                max={500}
                disabled={selected.brewStyle !== "iced"}
                value={selected.iceGrams}
                onChange={(e) => updateRecipe({ iceGrams: +e.target.value })}
              />
            </label>
          </div>
          <button className="ai-enhance-card" onClick={() => openAI("enhance")}>
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <strong>Enhance this recipe with AI</strong>
              <small>
                Describe the taste, then create an improved copy without overwriting this recipe.
              </small>
            </div>
            <b>→</b>
          </button>
          <section className="basics-card">
            <div className="subsection-heading">
              <div>
                <p className="eyebrow">COFFEE SETUP</p>
                <h3>Dose & grinder</h3>
              </div>
              <span>{selected.useGrinder ? "Automatic" : "Pre-ground"}</span>
            </div>
            <div className="basics-grid">
              <RangeBox
                label="Dose"
                value={selected.dose}
                min={5}
                max={30}
                step={0.5}
                unit="g"
                onChange={(dose) => updateRecipe({ dose })}
              />
              <RangeBox
                label="Grind size"
                value={selected.grind}
                min={1}
                max={80}
                unit=""
                hint={grindLabel(selected.grind)}
                disabled={!selected.useGrinder}
                onChange={(grind) => updateRecipe({ grind })}
              />
              <RangeBox
                label="Grinder speed"
                value={selected.rpm}
                min={60}
                max={120}
                step={10}
                unit="RPM"
                disabled={!selected.useGrinder}
                onChange={(rpm) => updateRecipe({ rpm: rpm as Recipe["rpm"] })}
              />
              <label>
                Water unit
                <select
                  value={selected.unit}
                  onChange={(e) =>
                    updateRecipe({
                      unit: e.target.value as Recipe["unit"],
                    })
                  }
                >
                  <option value="ml">Milliliters (ml)</option>
                  <option value="g">Grams (g)</option>
                </select>
              </label>
              <div className="grinder-choice wide">
                <div>
                  <strong>Use xBloom grinder</strong>
                  <small>
                    {selected.useGrinder
                      ? "The machine will grind the beans before brewing."
                      : "Pre-ground mode — only the water recipe will run."}
                  </small>
                </div>
                <button
                  type="button"
                  className={selected.useGrinder ? "toggle on" : "toggle"}
                  onClick={() => updateRecipe({ useGrinder: !selected.useGrinder })}
                  aria-pressed={selected.useGrinder}
                >
                  <span />
                </button>
              </div>
            </div>
          </section>
          <div className="pours-heading">
            <h3>Pour steps</h3>
            <div className="pour-summary">
              <span>
                {selected.pours.reduce((sum, p) => sum + p.volume, 0)} {selected.unit} total
              </span>
              <span>{selected.pours.length} pours</span>
              <b>
                1:
                {(selected.pours.reduce((sum, p) => sum + p.volume, 0) / selected.dose).toFixed(
                  1,
                )}{" "}
                ratio
              </b>
            </div>
          </div>
          {selected.pours.map((p, i) => (
            <div className="pour-step" id={`pour-step-${i}`} key={i}>
              <div className="pour-step-title">
                <b>{i + 1}</b>
                <div>
                  <strong>{i === 0 ? "Bloom" : `Pour ${i + 1}`}</strong>
                  <small>
                    Step {i + 1} of {selected.pours.length}
                  </small>
                </div>
                <button
                  className="remove-step"
                  onClick={() => removePour(i)}
                  disabled={selected.pours.length === 1}
                  title="Remove this pour"
                >
                  <Trash2 size={18} />
                  <span>Remove</span>
                </button>
              </div>
              <RangeBox
                label="Water volume"
                value={p.volume}
                min={0}
                max={240}
                unit={selected.unit}
                hint={`Pour ${i + 1} of ${selected.pours.length}`}
                onChange={(volume) => updatePour(i, { volume })}
              />
              <div className="pour-fields">
                <label>
                  Temperature (°C)
                  <input
                    type="number"
                    min="80"
                    max="96"
                    value={p.temp}
                    onChange={(e) => updatePour(i, { temp: +e.target.value })}
                  />
                </label>
                <label>
                  Flow rate (ml/s)
                  <select value={p.flow} onChange={(e) => updatePour(i, { flow: +e.target.value })}>
                    {[3, 3.1, 3.2, 3.3, 3.4, 3.5].map((v) => (
                      <option key={v}>{v.toFixed(1)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <RangeBox
                label="Pause after"
                value={p.pauseAfter}
                min={0}
                max={60}
                unit="sec"
                hint="Rest before the next pour"
                onChange={(pauseAfter) => updatePour(i, { pauseAfter })}
              />
              <fieldset className="pattern-picker">
                <legend>Pour pattern</legend>
                {(["center", "circular", "spiral"] as const).map((pattern) => (
                  <button
                    type="button"
                    key={pattern}
                    className={p.pattern === pattern ? "active" : ""}
                    onClick={() => updatePour(i, { pattern })}
                    aria-pressed={p.pattern === pattern}
                  >
                    <PatternGlyph pattern={pattern} active={p.pattern === pattern} />
                    <span>
                      {pattern === "center"
                        ? "Centered"
                        : pattern[0].toUpperCase() + pattern.slice(1)}
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="agitation-row">
                <span>Agitation</span>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={p.agitationBefore}
                    onChange={(e) => updatePour(i, { agitationBefore: e.target.checked })}
                  />
                  <span>Before pour</span>
                </label>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={p.agitationAfter}
                    onChange={(e) => updatePour(i, { agitationAfter: e.target.checked })}
                  />
                  <span>After pour</span>
                </label>
              </div>
            </div>
          ))}
          <button className="add-pour" onClick={addPour} disabled={selected.pours.length >= 8}>
            <Plus size={20} />
            <span>Add pour</span>
            <small>
              {selected.pours.length >= 8
                ? "Maximum 8 steps"
                : `Creates pour ${selected.pours.length + 1}`}
            </small>
          </button>
        </div>
        <aside className="recipe-visual">
          <div>
            <p className="eyebrow">POUR SUMMARY</p>
            <h3>{selected.pours.length} steps</h3>
            <span>
              {selected.pours.reduce((sum, p) => sum + p.volume, 0)} {selected.unit} · 1:
              {(selected.pours.reduce((sum, p) => sum + p.volume, 0) / selected.dose).toFixed(
                1,
              )}{" "}
              ratio
            </span>
          </div>
          <div
            className="pour-bars"
            style={{
              gridTemplateColumns: `repeat(${selected.pours.length}, minmax(0, 1fr))`,
            }}
          >
            {selected.pours.map((p, i) => (
              <article
                key={i}
                className="summary-pour"
                role="button"
                tabIndex={0}
                aria-label={`Edit ${i === 0 ? "Bloom" : `Pour ${i + 1}`}`}
                onClick={() =>
                  document
                    .getElementById(`pour-step-${i}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    document
                      .getElementById(`pour-step-${i}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  height: `${Math.max(210, 170 + p.volume * 1.7)}px`,
                }}
              >
                <header>
                  <b>{i + 1}</b>
                  <strong>
                    {p.volume}
                    <small>{selected.unit}</small>
                  </strong>
                </header>
                <div className="summary-pattern">
                  <PatternGlyph pattern={p.pattern} active={true} />
                  <strong>{p.temp}°C</strong>
                </div>
                <span className="summary-step-name">{i === 0 ? "Bloom" : `Pour ${i + 1}`}</span>
                <div className="summary-facts">
                  <span>
                    {p.pauseAfter}
                    <small>sec</small>
                  </span>
                </div>
                {p.agitationBefore && (
                  <span className="pause-corner before">
                    <Waves size={12} />
                  </span>
                )}
                {p.agitationAfter && (
                  <span className="pause-corner after">
                    <Waves size={12} />
                  </span>
                )}
              </article>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
