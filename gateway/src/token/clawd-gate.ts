/**
 * Gateway-local $CLAWD gate helpers.
 *
 * This mirrors the existing ClawdRouter token gate so gateway routes can check
 * holder balances without importing from another package tree.
 */

export const CLAWD_TOKEN_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

export async function getClawdBalance(
  walletAddress: string,
  rpcUrl: string,
  heliusApiKey?: string,
): Promise<number> {
  if (heliusApiKey) {
    try {
      return await getBalanceViaHelius(walletAddress, heliusApiKey);
    } catch {
      // Fall back to standard RPC.
    }
  }

  return getBalanceViaRpc(walletAddress, rpcUrl);
}

async function getBalanceViaHelius(
  walletAddress: string,
  apiKey: string,
): Promise<number> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'gateway-clawd-gate',
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        { mint: CLAWD_TOKEN_MINT },
        { encoding: 'jsonParsed' },
      ],
    }),
  });

  const data = await response.json() as {
    result?: {
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: { uiAmountString?: string };
              };
            };
          };
        };
      }>;
    };
  };

  return sumAccounts(data.result?.value ?? []);
}

async function getBalanceViaRpc(
  walletAddress: string,
  rpcUrl: string,
): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'gateway-clawd-gate',
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        { mint: CLAWD_TOKEN_MINT },
        { encoding: 'jsonParsed' },
      ],
    }),
  });

  const data = await response.json() as {
    result?: {
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: { uiAmountString?: string };
              };
            };
          };
        };
      }>;
    };
  };

  return sumAccounts(data.result?.value ?? []);
}

function sumAccounts(accounts: Array<{
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { uiAmountString?: string };
        };
      };
    };
  };
}>): number {
  let total = 0;
  for (const account of accounts) {
    const info = account.account?.data?.parsed?.info;
    if (info?.mint === CLAWD_TOKEN_MINT) {
      total += parseFloat(info.tokenAmount?.uiAmountString ?? '0');
    }
  }
  return total;
}
