import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// If this document is the Tesla OAuth popup returning to the app, hand the
// result back to the opener and close immediately — never boot the whole app
// (and never touch the auth session) in the throwaway window.
const teslaParams = new URLSearchParams(window.location.search);
const teslaReturn = teslaParams.get("tesla") ?? teslaParams.get("tesla_error");
if (teslaReturn && window.opener && window.opener !== window) {
  try {
    window.opener.postMessage(
      { type: "tesla-oauth", ok: teslaParams.get("tesla") === "connected", error: teslaParams.get("tesla_error") },
      window.location.origin,
    );
  } catch {
    /* ignore */
  }
  window.close();
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}


// One-time migration from the early preview PWA. That worker cached whole
// Home bundles and could keep showing the legacy double-car scene long after a
// successful deployment. Clear it before future releases introduce a properly
// versioned offline worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Version the migration for every release that changes the Home bundle.
    // v2 had already been recorded on Stephen's Fold, so it could not clear
    // the stale worker/cache after Patch 030 was deployed.
    const migrationKey = "ev-cache-migrated-20260818-v3";
    if (window.localStorage.getItem(migrationKey) === "1") return;
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      window.localStorage.setItem(migrationKey, "1");
      window.location.reload();
    });
  });
}
