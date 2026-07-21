import type { Dispatch, SetStateAction } from "react";
import type { Recipe } from "../domain/models";
import { initialRecipes } from "../domain/recipes";

type Props = {
  machineName: string;
  setMachineName: (name: string) => void;
  setRecipes: Dispatch<SetStateAction<Recipe[]>>;
  setSelectedId: (id: number) => void;
  setRecipeDirty: (dirty: boolean) => void;
};
export function SettingsPage({
  machineName,
  setMachineName,
  setRecipes,
  setSelectedId,
  setRecipeDirty,
}: Props) {
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
