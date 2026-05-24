import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./lib/theme.jsx";
import { api } from "./lib/api.js";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Paycheck from "./pages/Paycheck.jsx";
import Bills from "./pages/Bills.jsx";
import Savings from "./pages/Savings.jsx";
import Insights from "./pages/Insights.jsx";
import Import from "./pages/Import.jsx";
import Settings from "./pages/Settings.jsx";
import Onboarding from "./pages/Onboarding.jsx";

export default function App() {
  const [ready,         setReady]         = useState(false);
  const [onboarded,     setOnboarded]     = useState(true);  // optimistic default
  const [budgetVersion, setBudgetVersion] = useState(0);     // bump to re-check on switch

  useEffect(() => {
    setReady(false);
    api.settings()
      .then(({ settings }) => {
        setOnboarded(!!settings?.onboarded);
        setReady(true);
      })
      .catch(() => {
        setOnboarded(true);
        setReady(true);
      });
  }, [budgetVersion]);

  function handleBudgetSwitch() {
    setBudgetVersion((v) => v + 1);
  }

  if (!ready) {
    return (
      <ThemeProvider>
        <div className="loader">Loading…</div>
      </ThemeProvider>
    );
  }

  if (!onboarded) {
    return (
      <ThemeProvider>
        <Onboarding onComplete={() => setOnboarded(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="app">
        <Sidebar onBudgetSwitch={handleBudgetSwitch} />
        <main className="main">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/paycheck"  element={<Paycheck />} />
            <Route path="/bills"     element={<Bills />} />
            <Route path="/savings"   element={<Savings />} />
            <Route path="/insights"  element={<Insights />} />
            <Route path="/import"    element={<Import />} />
            <Route path="/settings"  element={<Settings />} />
          </Routes>
        </main>
      </div>
    </ThemeProvider>
  );
}
