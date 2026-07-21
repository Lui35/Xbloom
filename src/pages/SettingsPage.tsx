import { FileInput, FileOutput } from "lucide-react";
import type { AppController } from "../controllers/useAppController";
import { initialRecipes } from "../domain/recipes";

export function SettingsPage({ controller }: { controller: AppController }) {
  const {
    machineName,
    setMachineName,
    setRecipes,
    setSelectedId,
    setRecipeDirty,
    exportLibrary,
    importLibrary,
    libraryMessage,
  } = controller;
  return (
    <section className="editor-page settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h2>Settings</h2>
        </div>
      </div>
      <div className="form-card">
        <label>
          Machine name
          <input value={machineName} onChange={(e) => setMachineName(e.target.value)} />
          <small>Shown throughout your local dashboard.</small>
        </label>
        <div className="setting-row">
          <div>
            <strong>Local-only connection</strong>
            <small>Bluetooth and the control API remain on this computer.</small>
          </div>
          <span className="safe-pill">Enabled</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>Disconnect protection</strong>
            <small>Disconnecting will not abort an active machine operation.</small>
          </div>
          <span className="safe-pill">Enabled</span>
        </div>
        <div className="library-transfer">
          <div>
            <strong>Recipe and bean library</strong>
            <small>Back up or move all saved recipes and beans as one JSON file.</small>
          </div>
          <span>
            <label className="import-library">
              <FileInput size={16} /> Import library
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importLibrary(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button onClick={exportLibrary}>
              <FileOutput size={16} /> Export library
            </button>
          </span>
        </div>
        {libraryMessage && <p className="library-message">{libraryMessage}</p>}
        <button
          className="danger-button"
          onClick={() => {
            setRecipes(initialRecipes);
            setSelectedId(1);
            setRecipeDirty(true);
          }}
        >
          Restore default recipes
        </button>
      </div>
    </section>
  );
}
