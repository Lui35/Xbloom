import { Coffee, ImageUp, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Bean } from "../domain/models";
import { processDetailConfig } from "../domain/beanProcessing";

type Props = {
  beans: Bean[];
  openBeanEditor: (bean?: Bean) => void;
  openAI: (mode: "create" | "enhance", bean?: Bean) => void;
  saveBeans: (beans: Bean[]) => void;
  importBeanPhoto: (file: File) => Promise<void>;
  beanPhotoLoading: boolean;
  beanPhotoError: string;
};
export function BeansPage({
  beans,
  openBeanEditor,
  openAI,
  saveBeans,
  importBeanPhoto,
  beanPhotoLoading,
  beanPhotoError,
}: Props) {
  return (
    <section className="editor-page beans-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY COFFEE</p>
          <h2>Beans</h2>
          <p>Save a coffee once, then reuse its details in every AI recipe.</p>
        </div>
        <div className="bean-page-actions">
          <label className={`photo-import ${beanPhotoLoading ? "loading" : ""}`}>
            {beanPhotoLoading ? <LoaderCircle /> : <ImageUp />}
            {beanPhotoLoading ? "Reading package…" : "Import package photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={beanPhotoLoading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBeanPhoto(file);
                event.target.value = "";
              }}
            />
          </label>
          <button className="add-button" onClick={() => openBeanEditor()}>
            <Plus size={17} /> Add bean
          </button>
        </div>
      </div>
      {beanPhotoError && <p className="bean-photo-error">{beanPhotoError}</p>}
      {beans.length ? (
        <div className="bean-library">
          {beans.map((bean) => {
            const detail = bean.process_detail || bean.infused_with;
            return (
              <article key={bean.id}>
                <div className="bean-card-mark">
                  <Coffee />
                </div>
                <div>
                  <small>{bean.roaster || "YOUR COFFEE"}</small>
                  <h3>{bean.name}</h3>
                  <p>
                    {[bean.country, bean.region, bean.variety].filter(Boolean).join(" · ") ||
                      "Origin details not added"}
                  </p>
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
                  {bean.tasting_notes && <blockquote>{bean.tasting_notes}</blockquote>}
                </div>
                <footer>
                  <button className="ai-button" onClick={() => openAI("create", bean)}>
                    <Sparkles size={16} /> Create recipe with AI
                  </button>
                  <span className="bean-card-actions">
                    <button className="ai-secondary" onClick={() => openBeanEditor(bean)}>
                      Edit
                    </button>
                    <button
                      className="bean-delete"
                      aria-label={`Remove ${bean.name}`}
                      onClick={() => {
                        if (window.confirm(`Remove “${bean.name}” from My Beans?`))
                          saveBeans(beans.filter((b) => b.id !== bean.id));
                      }}
                    >
                      <Trash2 size={16} />
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
          <h3>Your bean shelf is empty</h3>
          <p>
            Add your first coffee and Gemini can reuse its origin, process, bean size, infusion,
            variety, and tasting notes.
          </p>
          <button className="ai-button" onClick={() => openBeanEditor()}>
            <Plus size={17} /> Add your first bean
          </button>
        </div>
      )}
    </section>
  );
}
