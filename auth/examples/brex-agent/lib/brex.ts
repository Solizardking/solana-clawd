const BREX_API_BASE = "https://platform.brexapis.com";

export interface BrexCard {
  id: string;
  card_name: string;
  card_type: "VIRTUAL" | "PHYSICAL";
  last_four: string;
  status: "ACTIVE" | "SHIPPED" | "LOCKED" | "TERMINATED";
  owner: { type: string; user_id: string };
  expiration_date: { month: number; year: number };
}

export interface BrexCardPan {
  id: string;
  number: string;
  cvv: string;
  expiration_date: { month: number; year: number };
  holder_name: string;
}

export interface BrexCashAccount {
  id: string;
  name: string;
  current_balance: { amount: number; currency: string };
  available_balance: { amount: number; currency: string };
}

async function brexFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BREX_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brex API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function listCards(token: string): Promise<BrexCard[]> {
  const data = await brexFetch<{ items: BrexCard[] }>(token, "/v2/cards");
  return data.items.filter((c) => c.status === "ACTIVE");
}

export async function getCardPan(token: string, cardId: string): Promise<BrexCardPan> {
  return brexFetch<BrexCardPan>(token, `/v2/cards/${cardId}/pan`);
}

export async function getCashBalance(
  token: string,
): Promise<{ amount: number; currency: string } | null> {
  try {
    const data = await brexFetch<{ items: BrexCashAccount[] }>(token, "/v2/accounts/cash");
    const primary = data.items[0];
    return primary?.available_balance ?? null;
  } catch {
    return null;
  }
}
