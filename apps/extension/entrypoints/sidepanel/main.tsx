import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initSentry } from "@/lib/sentry";
import "./style.css";

initSentry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
