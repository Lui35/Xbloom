import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Coffee,
  ImageUp,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { Bean, Recipe } from "../domain/models";
import { processDetailConfig } from "../domain/beanProcessing";

type Props = {
  beans: Bean[];
  recipes: Recipe[];
  openBeanEditor: (bean?: Bean) => void;
  openAI: (mode: "create" | "enhance", bean?: Bean) => void;
  saveBeans: (beans: Bean[]) => void;
  importBeanPhoto: (files: File[], bagWeight?: number) => Promise<void>;
  beanPhotoLoading: boolean;
  beanPhotoError: string;
};

function roastAge(bean: Bean) {
  if (!bean.roast_date) return null;
  const timestamp = new Date(`${bean.roast_date}T12:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function BeansPage({
  beans,
  recipes,
  openBeanEditor,
  openAI,
  saveBeans,
  importBeanPhoto,
  beanPhotoLoading,
  beanPhotoError,
}: Props) {
  const [query, setQuery] = useState("");
  const [processFilter, setProcessFilter] = useState("All");
  const [showArchived, setShowArchived] = useState(false);
  const [scanWeight, setScanWeight] = useState(250);
  const processes = useMemo(
    () => ["All", ...new Set(beans.map((bean) => bean.process).filter(Boolean) as string[])],
    [beans],
  );
  const visibleBeans = beans.filter((bean) => {
    if (Boolean(bean.archived) !== showArchived) return false;
    if (processFilter !== "All" && bean.process !== processFilter) return false;
    const text = [
      bean.name,
      bean.roaster,
      bean.country,
      bean.region,
      bean.process,
      bean.tasting_notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  return (
    <section className="editor-page beans-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY COFFEE</p>
          <h2>Beans</h2>
          <p>Track every bag from package scan to its final brew.</p>
        </div>
        <div className="bean-page-actions">
          <select
            className="bag-size-select"
            value={scanWeight}
            onChange={(event) => setScanWeight(+event.target.value)}
            aria-label="Package weight"
          >
            <option value={250}>250g bag</option>
            <option value={500}>500g bag</option>
            <option value={1000}>1kg bag</option>
          </select>
          <label className={`photo-import ${beanPhotoLoading ? "loading" : ""}`}>
            {beanPhotoLoading ? <LoaderCircle /> : <ImageUp />}
            {beanPhotoLoading ? "Reading package…" : "Scan package"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={beanPhotoLoading}
              onChange={(event) => {
                const files = Array.from(event.target.files || []).slice(0, 2);
                if (files.length) void importBeanPhoto(files, scanWeight);
                event.target.value = "";
              }}
            />
          </label>
          <button className="add-button" onClick={() => openBeanEditor()}>
            <Plus size={17} /> Add bean
          </button>
        </div>
      </div>
      <p className="package-scan-hint">
        For the best result, select the front photo first and the back photo second.
      </p>
      <div className="bean-toolbar">
        <label>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search origin, roaster, process, or tasting note"
          />
        </label>
        <select value={processFilter} onChange={(event) => setProcessFilter(event.target.value)}>
          {processes.map((process) => (
            <option key={process}>{process}</option>
          ))}
        </select>
        <button
          className={showArchived ? "active" : ""}
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive size={15} /> {showArchived ? "Archived bags" : "View archive"}
        </button>
      </div>
      {beanPhotoError && <p className="bean-photo-error">{beanPhotoError}</p>}
      {visibleBeans.length || beanPhotoLoading ? (
        <div className="bean-library">
          {beanPhotoLoading && !showArchived && (
            <article className="bean-processing-card" aria-live="polite">
              <div className="bean-scan-visual">
                <Coffee />
                <span />
              </div>
              <div>
                <p className="eyebrow">AI LABEL SCAN</p>
                <h3>Building your bean profile</h3>
                <ul>
                  <li>Reading front and back labels</li>
                  <li>Finding origin and process</li>
                  <li>Checking extraction confidence</li>
                </ul>
              </div>
            </article>
          )}
          {visibleBeans.map((bean) => {
            const detail = bean.process_detail || bean.infused_with;
            const age = roastAge(bean);
            const linkedRecipes = recipes.filter((recipe) => recipe.beanId === bean.id);
            const typicalDose = linkedRecipes[0]?.dose || 18;
            const initial = bean.initialWeightGrams || 250;
            const remaining = Math.max(0, bean.remainingWeightGrams ?? initial);
            const percent = Math.min(100, (remaining / initial) * 100);
            const uncertain = Object.entries(bean.aiConfidence || {}).filter(
              ([, score]) => score < 0.75,
            );
            return (
              <article key={bean.id} className={age !== null && age > 45 ? "bean-aging" : ""}>
                <div className="bean-card-mark">
                  {bean.packagePhotos?.front ? (
                    <img src={bean.packagePhotos.front} alt="Coffee package" />
                  ) : (
                    <Coffee />
                  )}
                </div>
                <div className="bean-card-content">
                  <div className="bean-card-heading">
                    <div className="bean-card-title">
                      <small>{bean.roaster || "YOUR COFFEE"}</small>
                      <h3>{bean.name}</h3>
                      {age !== null && (
                        <span className={age > 45 ? "roast-age warning" : "roast-age"}>
                          {age === 0 ? "Roasted today" : `${age} days from roast`}
                        </span>
                      )}
                    </div>
                    {!bean.archived && (
                      <button
                        className="bean-ai-action"
                        onClick={() => openAI("create", bean)}
                        title="Create an AI recipe for this bean"
                      >
                        <Sparkles aria-hidden="true" />
                        <span>Create recipe</span>
                      </button>
                    )}
                  </div>
                  <p className="bean-card-origin">
                    {[bean.country, bean.region, bean.variety].filter(Boolean).join(" · ") ||
                      "Origin details not added"}
                  </p>
                  {uncertain.length > 0 && (
                    <p className="confidence-warning">
                      Check: {uncertain.map(([field]) => field.replaceAll("_", " ")).join(", ")}
                    </p>
                  )}
                  <div className="bean-tags">
                    {[
                      bean.process,
                      bean.bean_size,
                      detail ? `${processDetailConfig(bean.process).label}: ${detail}` : "",
                      bean.roast_level,
                      bean.altitude_masl ? `${bean.altitude_masl} masl` : "",
                    ]
                      .filter(Boolean)
                      .map((value) => (
                        <span key={String(value)}>{value}</span>
                      ))}
                  </div>
                  <div className="bean-inventory">
                    <span>
                      <b>{remaining.toFixed(0)}g</b> of {initial}g
                    </span>
                    <span>{Math.floor(remaining / typicalDose)} brews left</span>
                    <i>
                      <em style={{ width: `${percent}%` }} />
                    </i>
                  </div>
                  {bean.acidity && (
                    <div className="bean-acidity" aria-label={`Acidity ${bean.acidity} of 5`}>
                      <small>Acidity</small>
                      <span>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <i key={level} className={level <= bean.acidity! ? "active" : ""} />
                        ))}
                      </span>
                    </div>
                  )}
                  {bean.tasting_notes && (
                    <blockquote>
                      <small>CUP NOTES</small>
                      <span>{bean.tasting_notes}</span>
                    </blockquote>
                  )}
                  {linkedRecipes.length > 0 && (
                    <details className="bean-recipes">
                      <summary>
                        {linkedRecipes.length} linked recipe{linkedRecipes.length === 1 ? "" : "s"}
                      </summary>
                      <div>
                        {linkedRecipes.map((recipe) => (
                          <span key={recipe.id}>
                            <b>{recipe.name}</b>
                            <small>
                              {recipe.ratio} · Grind {recipe.grind} · {recipe.pours.length} pours
                            </small>
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
                <footer>
                  <span className="bean-card-actions">
                    <button className="bean-card-action" onClick={() => openBeanEditor(bean)}>
                      <Pencil aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    <button
                      className="bean-card-action bean-archive"
                      onClick={() =>
                        saveBeans(
                          beans.map((item) =>
                            item.id === bean.id ? { ...item, archived: !item.archived } : item,
                          ),
                        )
                      }
                    >
                      {bean.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                      <span>{bean.archived ? "Restore" : "Archive"}</span>
                    </button>
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-beans">
          <Coffee size={42} />
          <h3>
            {showArchived
              ? "No archived bags"
              : query
                ? "No matching coffee"
                : "Your bean shelf is empty"}
          </h3>
          <p>
            {showArchived
              ? "Finished bags can be archived from their card."
              : "Add a bag manually or scan its front and back labels with AI."}
          </p>
          {!showArchived && !query && (
            <button className="ai-button" onClick={() => openBeanEditor()}>
              <Plus size={17} /> Add your first bean
            </button>
          )}
        </div>
      )}
    </section>
  );
}
