import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AgentAuthProvider } from "@auth/agent";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AgentAuthProvider>
      <App />
    </AgentAuthProvider>
  </React.StrictMode>,
);
