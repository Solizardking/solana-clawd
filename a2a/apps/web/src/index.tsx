import React from "react";
import ReactDOM from "react-dom/client";
import { AgentAuthProvider } from "../../../packages/auth/src/index.js";
import App from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AgentAuthProvider>
      <App />
    </AgentAuthProvider>
  </React.StrictMode>
);
