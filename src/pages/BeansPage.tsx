import { Coffee, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Bean } from "../domain/models";

type Props = {
  beans: Bean[];
  openBeanEditor: (bean?: Bean) => void;
  openAI: (mode: "create" | "enhance", bean?: Bean) => void;
  saveBeans: (beans: Bean[]) => void;
};
export function BeansPage({ beans, openBeanEditor, openAI, saveBeans }: Props) {
  return (
    <section className="editor-page beans-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MY COFFEE</p>
          <h2>Beans</h2>
          <p>Save a coffee once, then reuse its details in every AI recipe.</p>
        </div>
        <button className="add-button" onClick={() => openBeanEditor()}>
          <Plus size={17} /> Add bean
        </button>
      </div>
      {beans.length ? (
        <div className="bean-library">
          {beans.map((bean) => (
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
                    bean.roast_level,
                    bean.altitude_masl ? `${bean.altitude_masl} masl` : "",
                  ]
                    .filter(Boolean)
                    .map((value) => (
                      <span key={String(value)}>{value}</span>
                    ))}
                </div>
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
          ))}
        </div>
      ) : (
        <div className="empty-beans">
          <Coffee size={42} />
          <h3>Your bean shelf is empty</h3>
          <p>
            Add your first coffee and Gemini can reuse its origin, process, variety, and tasting
            notes.
          </p>
          <button className="ai-button" onClick={() => openBeanEditor()}>
            <Plus size={17} /> Add your first bean
          </button>
        </div>
      )}
    </section>
  );
}
