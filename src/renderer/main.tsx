import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./styles.css";

const initialTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
void window.codyboard.appearance.set(initialTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
