import { A2UIRenderer } from "./A2UIRenderer.js";

export default function App() {
  return (
    <main>
      <h1>SVM-A2A</h1>
      <p>Solana-native agent-to-agent runtime.</p>
      <A2UIRenderer
        title="Agent Card"
        parts={[
          {
            type: "text",
            text: "Metaplex Core identity, Clawd trust gates, and Solana settlement are exposed through the A2A discovery card."
          },
          {
            type: "data",
            data: {
              capabilities: ["streaming", "pushNotifications", "a2a", "svm-settlement"],
              authentication: ["SIWS", "NFT-Ownership", "CLAWD-Tier"],
              skills: ["research", "trading", "ui-generation", "mcp"]
            }
          }
        ]}
      />
    </main>
  );
}
