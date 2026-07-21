import { Coffee, History } from "lucide-react";
import type { BrewRecord } from "../domain/models";
import { formatTime } from "../domain/brewing";

export function HistoryPage({ history }: { history: BrewRecord[] }) {
  return (
    <section className="editor-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BREW JOURNAL</p>
          <h2>History</h2>
        </div>
      </div>
      {history.length === 0 ? (
        <div className="empty-card">
          <History />
          <h3>Your completed brews will appear here</h3>
          <p>History recording will begin with your next completed brew.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((record) => (
            <article key={record.id}>
              <span className="history-icon">
                <Coffee size={20} />
              </span>
              <div>
                <strong>{record.recipeName}</strong>
                <small>
                  {new Date(record.completedAt).toLocaleString()} · {record.steps} steps
                </small>
              </div>
              <b>{formatTime(record.duration)}</b>
              <span>{record.water.toFixed(0)} ml</span>
              <span>{record.coffee.toFixed(1)} g</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
