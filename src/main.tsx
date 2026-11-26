import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// After a new deploy the old page's code chunks are gone: a page opened before it fails to load the replay, the import
// or the generator. Reload once to get the new version (not again within a minute, so a real outage can't loop).
window.addEventListener("vite:preloadError", (e) => {
  try {
    const last = Number(sessionStorage.getItem("rumble-sim-reloaded") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("rumble-sim-reloaded", String(Date.now()));
  } catch {
    /* storage blocked: still reload once */
  }
  e.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
