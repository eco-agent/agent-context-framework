import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/public-sans";
import "@fontsource-variable/nunito-sans";

import { App } from "./App.js";
import "./styles/index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Setup UI root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
