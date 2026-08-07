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


if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.warn("Service worker registration failed:", error));
  });
}

