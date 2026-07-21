import { AlertTriangle, Radio, X } from "lucide-react";
import { useAppController } from "./controllers/useAppController";
import { BeansPage } from "./pages/BeansPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { RecipesPage } from "./pages/RecipesPage";
import { BrewPage } from "./pages/BrewPage";
import { HomePage } from "./pages/HomePage";
import { AppModals } from "./components/AppModals";

function App() {
  const controller = useAppController();
  const {
    connected,
    scanning,
    connectionError,
    waterAlert,
    setWaterAlert,
    setRecipes,
    setRecipeDirty,
    beans,
    setSelectedId,
    machineName,
    setMachineName,
    brewing,
    history,
    nav,
    setNav,
    navItems,
    saveBeans,
    openBeanEditor,
    openAI,
    toggleConnection,
    openBluetoothSettings,
  } = controller;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">x</span>
          <span>Bloom</span>
        </div>
        <nav>
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={nav === name ? "active" : ""}
              onClick={() => setNav(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="machine-mini">
            <div className="machine-dot" data-on={connected} />
            <div>
              <strong>{machineName}</strong>
              <span>{connected ? "Connected" : "Not connected"}</span>
            </div>
          </div>
          <small>DESKTOP COMPANION · 0.1</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">GOOD AFTERNOON</p>
            <h1>
              Your next cup,
              <br />
              <em>beautifully dialed.</em>
            </h1>
          </div>
          <div className="connection">
            <button
              className={connected ? "device connected" : "device"}
              onClick={toggleConnection}
              disabled={scanning || brewing}
              title={connected ? "Disconnect from xBloom" : "Find and connect to xBloom"}
            >
              <Radio size={17} />
              {scanning
                ? connected
                  ? "Disconnecting…"
                  : "Searching…"
                : connected
                  ? "Disconnect Studio"
                  : "Connect machine"}
            </button>
            {connectionError && (
              <div className="connection-help">
                <span>{connectionError}</span>
                <button type="button" onClick={openBluetoothSettings}>
                  Open Bluetooth settings
                </button>
              </div>
            )}
          </div>
        </header>
        {waterAlert && (
          <div className="water-alert" role="alert">
            <span className="alert-icon">
              <AlertTriangle size={19} />
            </span>
            <div>
              <strong>Water level is low</strong>
              <span>Fill the xBloom water tank before starting your next brew.</span>
            </div>
            <button onClick={() => setWaterAlert(false)} aria-label="Dismiss low water alert">
              <X size={17} />
            </button>
          </div>
        )}

        <AppModals controller={controller} />
        {nav === "Recipes" && <RecipesPage controller={controller} />}
        {nav === "Beans" && (
          <BeansPage
            beans={beans}
            openBeanEditor={openBeanEditor}
            openAI={openAI}
            saveBeans={saveBeans}
          />
        )}
        {nav === "Settings" && (
          <SettingsPage
            machineName={machineName}
            setMachineName={setMachineName}
            setRecipes={setRecipes}
            setSelectedId={setSelectedId}
            setRecipeDirty={setRecipeDirty}
          />
        )}
        {nav === "History" && <HistoryPage history={history} />}

        {nav === "Brew" && <BrewPage controller={controller} />}
        <HomePage controller={controller} />
      </main>
    </div>
  );
}
export default App;
