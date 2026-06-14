import { createContext, type PropsWithChildren, useContext, useMemo } from "react";

export class AgentAuthClient {
  constructor(private readonly baseUrl = "/auth") {}

  async challenge() {
    const response = await fetch(`${this.baseUrl}/challenge`);
    if (!response.ok) {
      throw new Error(`Agent auth challenge failed: ${response.status}`);
    }
    return response.json() as Promise<{ message: string; nonce: string }>;
  }

  async verify(input: { wallet: string; signature: string; message: string }) {
    const response = await fetch(`${this.baseUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    return response.json();
  }
}

const AgentAuthContext = createContext<AgentAuthClient | null>(null);

export function AgentAuthProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => new AgentAuthClient(), []);
  return (
    <AgentAuthContext.Provider value={client}>
      {children}
    </AgentAuthContext.Provider>
  );
}

export function useAgentAuth() {
  const client = useContext(AgentAuthContext);
  if (!client) {
    throw new Error("useAgentAuth must be used inside AgentAuthProvider");
  }
  return client;
}
