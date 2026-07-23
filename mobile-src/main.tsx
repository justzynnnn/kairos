import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileApp } from "./app";
import { applyTheme, storedTheme } from "./lib/theme";
import "./styles.css";

// Before React renders, so a phone that chose a palette never paints the other
// one first.
applyTheme(storedTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
