import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { Router } from "./lib/router";
import { applyThemeModeToDocument, readStoredThemeMode } from "./lib/theme-mode";
import "./styles.css";

applyThemeModeToDocument(readStoredThemeMode(typeof window !== "undefined" ? window.localStorage : null), document);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
);