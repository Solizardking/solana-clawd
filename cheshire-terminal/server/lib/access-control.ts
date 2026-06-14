import type { Request, Response, NextFunction } from "express";
import { getClawdBalance, ClawdBalanceError } from "./clawd-balance";

export const HOLDER_MIN = Number(process.env.CLAWD_HOLDER_MIN ?? "1");
export const ADMIN_CLAWD_BALANCE = 1_000_000;

type AccessCacheEntry = {
  expiresAt: number;
  balance: number;
  allowed: boolean;
  stale?: boolean;
};

const ACCESS_CACHE_TTL_MS = 30_000;
const accessCache = new Map<string, AccessCacheEntry>();

const PRIMARY_ADMIN_WALLET = "Becdrh2JbLt8qcLXpNbNF8w4Z5W1AQXJhGYMDigjcJr3";
const LEGACY_ADMIN_WALLET = "EFH1ouVP6ikYgyHm9zaLXSPHJDXsfVcaVLFPjtzw6BbF";

export function adminWalletList() {
  const primaryAdmin =
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    process.env.TREASURY_WALLET ||
    PRIMARY_ADMIN_WALLET;
  const configuredWallets = [
    process.env.ADMIN_WALLETS || "",
    process.env.ADMINWALLETS || "",
    process.env.CLAWD_ADMIN_WALLETS || "",
  ]
    .flatMap((value) => value.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  const wallets = Array.from(new Set(configuredWallets));
  if (!wallets.includes(primaryAdmin)) {
    wallets.push(primaryAdmin);
  }
  // Always include both built-in admin wallets regardless of env config.
  if (!wallets.includes(PRIMARY_ADMIN_WALLET)) {
    wallets.push(PRIMARY_ADMIN_WALLET);
  }
  if (!wallets.includes(LEGACY_ADMIN_WALLET)) {
    wallets.push(LEGACY_ADMIN_WALLET);
  }
  return wallets;
}

export function isAdminWallet(walletAddress?: string | null) {
  return !!walletAddress && adminWalletList().includes(walletAddress);
}

function requestWalletAddress(req: Request) {
  return req.session.walletAddress ?? req.convexAuth?.walletAddress ?? null;
}

function requestRole(req: Request) {
  return req.session.userRole ?? req.convexAuth?.role ?? null;
}

export async function getWalletAccessState(walletAddress?: string | null) {
  if (!walletAddress) {
    return {
      allowed: false,
      isAdmin: false,
      balance: 0,
      holderMinimum: HOLDER_MIN,
    };
  }

  if (isAdminWallet(walletAddress)) {
    return {
      allowed: true,
      isAdmin: true,
      balance: ADMIN_CLAWD_BALANCE,
      holderMinimum: HOLDER_MIN,
    };
  }

  const cached = accessCache.get(walletAddress);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      allowed: cached.allowed,
      isAdmin: false,
      balance: cached.balance,
      holderMinimum: HOLDER_MIN,
    };
  }

  try {
    const balance = await getClawdBalance(walletAddress);
    const allowed = balance >= HOLDER_MIN;
    accessCache.set(walletAddress, {
      expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
      balance,
      allowed,
    });
    return { allowed, isAdmin: false, balance, holderMinimum: HOLDER_MIN };
  } catch (err) {
    if (err instanceof ClawdBalanceError) {
      console.warn(`[access-control] balance check failed (code ${err.code}): ${err.message}`);
    } else {
      console.warn("[access-control] balance check error:", err);
    }
    // On RPC error (e.g. 429), fall back to stale cache rather than treating holder as non-holder
    if (cached) {
      return { allowed: cached.allowed, isAdmin: false, balance: cached.balance, holderMinimum: HOLDER_MIN };
    }
    // No cache at all — fail open so a transient RPC outage doesn't lock everyone out
    return { allowed: true, isAdmin: false, balance: 0, holderMinimum: HOLDER_MIN };
  }
}

export async function requireHolderOrAdminSession(req: Request, res: Response, next: NextFunction) {
  const walletAddress = requestWalletAddress(req);
  const role = requestRole(req);

  if (role === "admin" && walletAddress) {
    if (req.session.userRole !== "admin") {
      req.session.userRole = "admin";
    }
    if (!req.session.walletAddress) {
      req.session.walletAddress = walletAddress;
    }
    return next();
  }

  const access = await getWalletAccessState(walletAddress);

  if (access.allowed) {
    if (req.session.userRole !== "admin" && access.isAdmin) {
      req.session.userRole = "admin";
    }
    return next();
  }

  return res.status(403).json({
    error: `Access requires the admin wallet or at least ${access.holderMinimum} $CLAWD.`,
    accessRequired: true,
    isHolder: false,
    clawdBalance: access.balance,
    walletAddress: walletAddress ?? null,
  });
}
