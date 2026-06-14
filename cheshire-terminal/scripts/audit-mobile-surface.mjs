#!/usr/bin/env node

import { readFileSync } from "node:fs";

const files = {
  app: "client/src/App.tsx",
  mobileRemote: "client/src/components/MobileRemoteControl.tsx",
  terminal: "client/src/pages/terminal.tsx",
  wallet: "client/src/components/Wallet.tsx",
  walletSignIn: "client/src/components/WalletSignIn.tsx",
  remote: "client/src/pages/RemoteControlPage.tsx",
  telegramMini: "client/src/components/TelegramMiniApp.tsx",
  account: "client/src/pages/AccountPage.tsx",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readFileSync(file, "utf8")]),
);

const checks = [
  {
    name: "App shell renders a mobile remote dock with safe bottom padding",
    file: files.app,
    ok:
      /import \{ MobileRemoteControl \}/.test(source.app) &&
      /showMobileRemote\s*=/.test(source.app) &&
      /pb-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/.test(source.app) &&
      /<MobileRemoteControl hidden=\{!showMobileRemote\}/.test(source.app),
  },
  {
    name: "Mobile remote dock is fixed, safe-area aware, and exposes core routes",
    file: files.mobileRemote,
    ok:
      /fixed inset-x-0 bottom-0/.test(source.mobileRemote) &&
      /env\(safe-area-inset-bottom\)/.test(source.mobileRemote) &&
      /md:hidden/.test(source.mobileRemote) &&
      /href: "\/free"/.test(source.mobileRemote) &&
      /href: "\/terminal"/.test(source.mobileRemote) &&
      /href: "\/remote"/.test(source.mobileRemote) &&
      /href: "\/agents"/.test(source.mobileRemote) &&
      /accountHref = isAuthenticated \? "\/account" : "\/token-gated"/.test(source.mobileRemote),
  },
  {
    name: "Terminal has mobile remote controls and horizontally scrollable tabs",
    file: files.terminal,
    ok:
      /aria-label="Terminal mobile remote controls"/.test(source.terminal) &&
      /md:hidden/.test(source.terminal) &&
      /\/remote\?source=terminal/.test(source.terminal) &&
      /\/telegram\?source=terminal/.test(source.terminal) &&
      /\/agents\?source=terminal/.test(source.terminal) &&
      /\/account\?source=terminal/.test(source.terminal) &&
      /overflow-x-auto/.test(source.terminal) &&
      /\[-webkit-overflow-scrolling:touch\]/.test(source.terminal),
  },
  {
    name: "Wallet provider auto-connects Phantom on main app routes",
    file: files.wallet,
    ok:
      /PhantomWalletAdapter/.test(source.wallet) &&
      /WalletProvider wallets=\{wallets\} autoConnect/.test(source.wallet) &&
      /WalletModalProvider/.test(source.wallet),
  },
  {
    name: "Shared wallet sign-in has mobile Phantom deep-link fallback and app auth sign-in",
    file: files.walletSignIn,
    ok:
      /getPhantomBrowseUrl/.test(source.walletSignIn) &&
      /Open this page in Phantom/.test(source.walletSignIn) &&
      /sm:hidden/.test(source.walletSignIn) &&
      /WalletMultiButton/.test(source.walletSignIn) &&
      /handleSignIn/.test(source.walletSignIn) &&
      /signIn\(\)/.test(source.walletSignIn),
  },
  {
    name: "Remote page composes terminal and agent handoff URLs with wallet state",
    file: files.remote,
    ok:
      /WalletSignIn/.test(source.remote) &&
      /terminalHref/.test(source.remote) &&
      /\/terminal\?source=remote&tab=/.test(source.remote) &&
      /agentHref/.test(source.remote) &&
      /\/agents\/builder\?source=remote/.test(source.remote) &&
      /\/telegram\?source=remote/.test(source.remote),
  },
  {
    name: "Telegram mini-app validates Telegram session and registers wallet handoff",
    file: files.telegramMini,
    ok:
      /\/api\/telegram\/session/.test(source.telegramMini) &&
      /\/api\/telegram\/register/.test(source.telegramMini) &&
      /url\.searchParams\.set\("source", "telegram-mini"\)/.test(source.telegramMini) &&
      /WalletSignIn compact/.test(source.telegramMini) &&
      /remoteActions/.test(source.telegramMini),
  },
  {
    name: "Account page joins wallet auth, Telegram link state, and remote actions",
    file: files.account,
    ok:
      /WalletSignIn/.test(source.account) &&
      /\/api\/telegram-link\/status/.test(source.account) &&
      /remoteReady/.test(source.account) &&
      /\/terminal\?source=account/.test(source.account) &&
      /\/mini-app\?source=account/.test(source.account) &&
      /\/agents\/builder\?source=account/.test(source.account),
  },
];

const failures = checks.filter((check) => !check.ok);

if (failures.length) {
  console.error("Mobile surface audit failed:");
  for (const failure of failures) {
    console.error(`  - ${failure.name} (${failure.file})`);
  }
  process.exit(1);
}

console.log(`Mobile surface audit passed: ${checks.length} mobile wallet/remote invariants covered.`);
