import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileApp } from "./app";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
