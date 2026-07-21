import { Coffee, LoaderCircle, Save, Sparkles, X } from "lucide-react";
import type { AIBeanProfile } from "../api";
import type { AppController } from "../controllers/useAppController";
import { processDetailConfig } from "../domain/beanProcessing";

export function AppModals({ controller }: { controller: AppController }) {
  const {
    beanEditor,
    selectedBeanId,
    aiBean,
    setAiBean,
    setBeanEditor,
    saveBeanEditor,
    aiMode,
    selected,
    setAiMode,
    selectBeanForAI,
    beans,
    aiResult,
    setAiResult,
    aiFeedback,
    setAiFeedback,
    aiRating,
    setAiRating,
    aiLoading,
    aiElapsed,
    aiError,
    runAI,
    saveAIRecipe,
  } = controller;
  const processDetail = processDetailConfig(aiBean.process);
  return (
    <>
      {beanEditor && (
        <div className="ai-modal-backdrop" role="presentation">
          <section
            className="ai-modal bean-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bean-title"
          >
            <header>
              <div>
                <p className="eyebrow">MY BEANS</p>
                <h2 id="bean-title">{selectedBeanId ? "Edit bean" : "Add a bean"}</h2>
                <p>Save its details once and reuse them whenever you create or enhance a recipe.</p>
              </div>
              <button onClick={() => setBeanEditor(false)} aria-label="Close">
                <X />
              </button>
            </header>
            <div className="ai-form">
              <label>
                Bean name
                <input
                  autoFocus
                  placeholder="e.g. El Paraíso Lychee"
                  value={aiBean.name}
                  onChange={(e) => setAiBean({ ...aiBean, name: e.target.value })}
                />
              </label>
              <label>
                Roaster
                <input
                  placeholder="e.g. Manhattan Coffee Roasters"
                  value={aiBean.roaster || ""}
                  onChange={(e) => setAiBean({ ...aiBean, roaster: e.target.value })}
                />
              </label>
              <label>
                Country
                <input
                  placeholder="e.g. Colombia"
                  value={aiBean.country || ""}
                  onChange={(e) => setAiBean({ ...aiBean, country: e.target.value })}
                />
              </label>
              <label>
                Region
                <input
                  placeholder="e.g. Huila"
                  value={aiBean.region || ""}
                  onChange={(e) => setAiBean({ ...aiBean, region: e.target.value })}
                />
              </label>
              <label>
                Producer / farm
                <input
                  value={aiBean.producer || ""}
                  onChange={(e) => setAiBean({ ...aiBean, producer: e.target.value })}
                />
              </label>
              <label>
                Species
                <select
                  value={aiBean.species || ""}
                  onChange={(e) => setAiBean({ ...aiBean, species: e.target.value })}
                >
                  <option value="">Optional</option>
                  <option>Arabica</option>
                  <option>Robusta</option>
                  <option>Liberica</option>
                </select>
              </label>
              <label>
                Variety
                <input
                  placeholder="e.g. Pink Bourbon"
                  value={aiBean.variety || ""}
                  onChange={(e) => setAiBean({ ...aiBean, variety: e.target.value })}
                />
              </label>
              <label>
                Process
                <select
                  value={aiBean.process || ""}
                  onChange={(e) =>
                    setAiBean({ ...aiBean, process: e.target.value, process_detail: "" })
                  }
                >
                  {[
                    "Washed",
                    "Natural",
                    "Honey",
                    "Anaerobic",
                    "Carbonic maceration",
                    "Wet-hulled",
                    "Co-fermented",
                    "Infused",
                    "Decaffeinated",
                    "Experimental / other",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Bean size / screen size
                <input
                  placeholder="e.g. Screen 16–18, small, large"
                  value={aiBean.bean_size || ""}
                  onChange={(e) => setAiBean({ ...aiBean, bean_size: e.target.value })}
                />
              </label>
              <label>
                {processDetail.label}
                <input
                  placeholder={processDetail.placeholder}
                  value={aiBean.process_detail || aiBean.infused_with || ""}
                  onChange={(e) => setAiBean({ ...aiBean, process_detail: e.target.value })}
                />
              </label>
              <label>
                Altitude (masl)
                <input
                  type="number"
                  min="0"
                  max="3000"
                  placeholder="Optional"
                  value={aiBean.altitude_masl || ""}
                  onChange={(e) =>
                    setAiBean({
                      ...aiBean,
                      altitude_masl: e.target.value ? +e.target.value : undefined,
                    })
                  }
                />
              </label>
              <label>
                Roast level
                <select
                  value={aiBean.roast_level || ""}
                  onChange={(e) => setAiBean({ ...aiBean, roast_level: e.target.value })}
                >
                  <option value="">Optional</option>
                  <option>Light</option>
                  <option>Medium-light</option>
                  <option>Medium</option>
                  <option>Medium-dark</option>
                  <option>Dark</option>
                </select>
              </label>
              <label className="wide">
                Tasting notes
                <input
                  placeholder="e.g. strawberry, cacao, floral"
                  value={aiBean.tasting_notes || ""}
                  onChange={(e) => setAiBean({ ...aiBean, tasting_notes: e.target.value })}
                />
              </label>
            </div>
            <footer>
              <button className="ai-secondary" onClick={() => setBeanEditor(false)}>
                Cancel
              </button>
              <button className="ai-submit" disabled={!aiBean.name.trim()} onClick={saveBeanEditor}>
                <Save size={17} /> Save bean
              </button>
            </footer>
          </section>
        </div>
      )}

      {aiMode && (
        <div className="ai-modal-backdrop" role="presentation">
          <section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title">
            <header>
              <div>
                <p className="eyebrow">AI RECIPE LAB</p>
                <h2 id="ai-title">
                  {aiMode === "create" ? "Create a recipe" : "Enhance your recipe"}
                </h2>
                <p>
                  {aiMode === "create"
                    ? "Choose a saved bean, then tell Gemini what cup you want."
                    : `Improve “${selected.name}” from your tasting experience.`}
                </p>
              </div>
              <button onClick={() => setAiMode(null)} aria-label="Close">
                <X />
              </button>
            </header>
            <div className="ai-bean-picker">
              <label>
                Bean
                <select
                  value={selectedBeanId || ""}
                  onChange={(e) => selectBeanForAI(+e.target.value)}
                >
                  {beans.map((bean) => (
                    <option value={bean.id} key={bean.id}>
                      {bean.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedBeanId && (
                <span>
                  <Coffee size={18} />
                  <b>{aiBean.name}</b>
                  <small>
                    {[aiBean.country, aiBean.process, aiBean.variety].filter(Boolean).join(" · ")}
                  </small>
                </span>
              )}
            </div>
            {!aiResult && aiMode === "create" && (
              <div className="ai-form">
                <label>
                  Brew style
                  <select
                    value={aiBean.brew_style}
                    onChange={(e) =>
                      setAiBean({
                        ...aiBean,
                        brew_style: e.target.value as AIBeanProfile["brew_style"],
                      })
                    }
                  >
                    <option value="hot">Hot</option>
                    <option value="iced">Iced pour-over</option>
                    <option value="cold">Cold</option>
                  </select>
                </label>
                <label>
                  How many cups?
                  <select
                    value={aiBean.cups || 1}
                    onChange={(e) => setAiBean({ ...aiBean, cups: +e.target.value as 1 | 2 | 3 })}
                  >
                    <option value={1}>1 cup</option>
                    <option value={2}>2 cups</option>
                    <option value={3}>3 smaller cups</option>
                  </select>
                </label>
              </div>
            )}
            {!aiResult && aiMode === "enhance" && (
              <div className="ai-feedback">
                <label>
                  How did it taste?
                  <textarea
                    autoFocus
                    placeholder="It was slightly sour and thin. I want more sweetness and body…"
                    value={aiFeedback}
                    onChange={(e) => setAiFeedback(e.target.value)}
                  />
                </label>
                <label>
                  Overall rating
                  <select value={aiRating} onChange={(e) => setAiRating(+e.target.value)}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option value={v} key={v}>
                        {v} / 5
                      </option>
                    ))}
                  </select>
                </label>
                <div className="feedback-chips">
                  {[
                    "Too sour",
                    "Too bitter",
                    "Too weak",
                    "Too strong",
                    "More sweetness",
                    "More clarity",
                    "More body",
                    "Too dry",
                  ].map((text) => (
                    <button
                      key={text}
                      onClick={() =>
                        setAiFeedback((value) => `${value}${value ? " " : ""}${text}.`)
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiLoading && (
              <div className="ai-generating" role="status" aria-live="polite">
                <LoaderCircle />
                <div>
                  <strong>Designing your recipe</strong>
                  <span>Gemini is balancing the grind, temperature, and pours.</span>
                  <small>{aiElapsed}s elapsed · usually ready within 20–40 seconds</small>
                </div>
              </div>
            )}
            {aiError && (
              <p className="ai-error" role="alert">
                <strong>Recipe generation failed</strong>
                <span>{aiError}</span>
              </p>
            )}
            {aiResult && (
              <div className="ai-preview">
                <div>
                  <Sparkles />
                  <span>
                    <small>AI SUGGESTION</small>
                    <h3>{aiResult.name}</h3>
                    <p>{aiResult.rationale}</p>
                  </span>
                </div>
                <div className="ai-preview-stats">
                  <span>
                    Grind <b>{aiResult.grind}</b>
                  </span>
                  <span>
                    Speed <b>{aiResult.rpm} RPM</b>
                  </span>
                  <span>
                    Dose <b>{aiResult.dose}g</b>
                  </span>
                  <span>
                    Machine water <b>{aiResult.pours.reduce((s, p) => s + p.volume, 0)}ml</b>
                  </span>
                  <span>
                    Style{" "}
                    <b>{aiResult.brew_style === "iced" ? "Iced pour-over" : aiResult.brew_style}</b>
                  </span>
                  {aiResult.brew_style === "iced" && (
                    <span>
                      Ice <b>{aiResult.ice_grams}g</b>
                    </span>
                  )}
                </div>
                <div className="ai-preview-pours">
                  {aiResult.pours.map((p, i) => (
                    <span key={i}>
                      <b>{i + 1}</b>
                      {p.volume}ml · {p.temp}° · {p.flow.toFixed(1)}ml/s
                    </span>
                  ))}
                </div>
              </div>
            )}
            <footer>
              {aiResult ? (
                <>
                  <button className="ai-secondary" onClick={() => setAiResult(null)}>
                    Try again
                  </button>
                  <button className="ai-submit" onClick={saveAIRecipe}>
                    <Save size={17} /> Save as new recipe
                  </button>
                </>
              ) : (
                <>
                  <button className="ai-secondary" onClick={() => setAiMode(null)}>
                    Cancel
                  </button>
                  <button
                    className="ai-submit"
                    disabled={aiLoading || (aiMode === "enhance" && aiFeedback.trim().length < 3)}
                    onClick={runAI}
                  >
                    <Sparkles size={17} />
                    {aiLoading
                      ? "Designing recipe…"
                      : aiMode === "create"
                        ? "Generate recipe"
                        : "Create improved copy"}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
