import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Copy, ExternalLink, Flame, Loader2, Lock, LogIn, LogOut, ShieldCheck, Sparkles, Twitter, UserPlus, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getClerkSignInUrl, getClerkSignUpUrl, getClerkUserProfileUrl, hasClerk } from "@/lib/clerk";
import { getPhantomBrowseUrl } from "@/lib/phantomLinks";

const CLAWD_SUB_AMOUNT = "69,420";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

function ClawdSubscriptionBanner() {
  const [copied, setCopied] = useState(false);
  const cmd = `./scripts/pay.sh subscribe \\
  "$CLAWD_PLAN_PDA" "$CLAWD_PULLER" "<your-wallet>"`;
  return (
    <div className="w-full rounded-xl border border-purple-500/20 bg-purple-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-purple-200">
          {CLAWD_SUB_AMOUNT} <span className="text-purple-400">$CLAWD</span> / month
        </span>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-purple-500">Premium</span>
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        Recurring on-chain subscription via the Solana Subscriptions Program. Delegates token pulls to the terminal — cancel anytime.
      </p>
      <div className="relative">
        <pre className="rounded-md bg-black/60 px-3 py-2 text-[9px] font-mono text-purple-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {cmd}
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 text-[9px] text-purple-400 hover:text-purple-200 transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(
              `./scripts/pay.sh subscribe "$CLAWD_PLAN_PDA" "$CLAWD_PULLER" "<your-wallet>"`
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>
      <p className="text-[9px] text-gray-600 font-mono truncate">
        mint: {CLAWD_MINT.slice(0, 16)}…
      </p>
    </div>
  );
}

function truncate(addr: string) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "";
}

function getUserIdentityLabel(user: {
  walletAddress?: string | null;
  profile?: { displayName?: string | null } | undefined;
}) {
  if (user.walletAddress) return truncate(user.walletAddress);
  if (user.profile?.displayName) return user.profile.displayName;
  return "Signed in";
}

function PhantomMobileDeepLink() {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-9 w-full gap-1.5 border-purple-400/30 bg-purple-500/10 text-[11px] text-purple-100 hover:bg-purple-500/15 sm:hidden"
    >
      <a href={getPhantomBrowseUrl()}>
        <ExternalLink className="h-3.5 w-3.5" />
        Open this page in Phantom
      </a>
    </Button>
  );
}

type WalletSignInProps = {
  compact?: boolean;
};

export function WalletSignIn({ compact = false }: WalletSignInProps) {
  const clerkEnabled = hasClerk();
  const { connected, publicKey } = useWallet();
  const { user, isAuthenticated, isLoading, signIn, signOut, saveProfile, signInStatus, error } = useAuth();
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [clawdSupply, setClawdSupply] = useState<{
    current: number;
    locked: number;
    burned: number;
    burnedPct: number;
    effectiveBurned?: number;
    effectiveBurnedPct?: number;
    incineratorBalance?: number;
    updatedAt: string;
  } | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    twitterUsername: "",
    githubUsername: "",
    agentName: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      displayName: user.profile?.displayName ?? "",
      bio: user.profile?.bio ?? "",
      avatarUrl: user.profile?.avatarUrl ?? "",
      twitterUsername: user.profile?.twitterUsername ?? "",
      githubUsername: user.profile?.githubUsername ?? "",
      agentName: user.profile?.agentName ?? "",
    });
  }, [user]);

  // Detect return from Twitter OAuth and show success toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("twitterLinked");
    const handle = params.get("twitterHandle");
    const twitterError = params.get("twitterError");
    if (linked === "1") {
      toast({
        title: "X / Twitter linked",
        description: handle ? `@${handle} verified and saved to your profile.` : "Twitter account linked successfully.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (twitterError) {
      toast({
        title: "Twitter link failed",
        description: twitterError.replace(/_/g, " "),
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const loadSupply = () => {
      fetch("/api/auth/entry", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && data?.clawdSupply) setClawdSupply(data.clawdSupply);
        })
        .catch(() => {});
    };
    loadSupply();
    const timer = window.setInterval(loadSupply, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [publicKey]);

  const supplyBurned = clawdSupply?.effectiveBurned ?? clawdSupply?.burned ?? 0;
  const supplyBurnedPct = clawdSupply?.effectiveBurnedPct ?? clawdSupply?.burnedPct ?? 0;
  const clawdStatsView = clawdSupply ? (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-purple-200/80">
      <Badge variant="outline" className="h-5 border-orange-500/40 bg-orange-500/10 text-orange-300 gap-1">
        <Flame className="h-3 w-3" />
        {supplyBurned.toLocaleString(undefined, { maximumFractionDigits: 0 })} burned
        {" · "}
        {supplyBurnedPct.toFixed(2)}%
      </Badge>
      <Badge variant="outline" className="h-5 border-blue-500/40 bg-blue-500/10 text-blue-300 gap-1">
        <Lock className="h-3 w-3" />
        {clawdSupply.locked.toLocaleString(undefined, { maximumFractionDigits: 0 })} locked
      </Badge>
    </div>
  ) : null;

  const handleSignIn = async () => {
    setSigning(true);
    try {
      await signIn();
      toast({ title: "Signed in", description: "Welcome to CLAWD Terminal." });
    } catch (err: any) {
      toast({
        title: "Sign-in failed",
        description: err?.message ?? "Could not verify wallet signature.",
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out", description: "Session ended." });
  };

  const copyAddress = () => {
    const addr = user?.walletAddress ?? publicKey?.toBase58();
    if (addr) {
      navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await saveProfile(profileForm);
      setProfileDialogOpen(false);
      toast({ title: "Profile saved", description: "Your wallet trainer profile is live." });
    } catch (err: any) {
      toast({
        title: "Could not save profile",
        description: err?.message ?? "Profile update failed.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  if (isLoading) return null;

  // Not connected — show wallet button
  if (!connected) {
    if (compact) {
      return (
        <div className="mobile-scroll flex w-full min-w-0 items-center justify-end gap-1.5 overflow-x-auto sm:w-auto">
          <WalletMultiButton className="!h-8 !min-h-8 !w-auto !min-w-[112px] !max-w-[140px] !justify-center !rounded-md !bg-purple-600 !px-3 !text-[11px] hover:!bg-purple-700" />
          {clerkEnabled && (
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1 border-cyan-400/30 bg-black/30 px-2 text-[10px] text-cyan-200 hover:bg-cyan-500/10"
              >
                <a href={getClerkSignUpUrl()}>
                  <UserPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clerk</span>
                </a>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-[10px] text-cyan-200/80 hover:bg-cyan-500/10 hover:text-cyan-100"
              >
                <a href={getClerkSignInUrl()} aria-label="Sign in with Clerk">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </a>
              </Button>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center gap-2">
        {clawdStatsView}
        <WalletMultiButton className="!w-full sm:!w-auto !justify-center !bg-purple-600 hover:!bg-purple-700 !text-xs !min-h-10 !rounded-md !px-4" />
        <PhantomMobileDeepLink />
        {clerkEnabled && (
          <>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 w-full gap-1.5 border-cyan-400/30 bg-black/30 text-[11px] text-cyan-200 transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-500/10 sm:w-auto"
            >
              <a href={getClerkSignUpUrl()}>
                <UserPlus className="h-3.5 w-3.5" />
                Create Clerk account
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 w-full gap-1.5 text-[11px] text-cyan-200/80 hover:bg-cyan-500/10 hover:text-cyan-100 sm:w-auto"
            >
              <a href={getClerkSignInUrl()}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Sign in with Clerk
              </a>
            </Button>
            <p className="text-center text-[10px] text-gray-500">
              Wallet sign-in still controls the $CLAWD gate.
            </p>
          </>
        )}
        <p className="text-[10px] text-gray-500 sm:hidden">
          Use Phantom's in-app browser if your mobile wallet app does not open automatically.
        </p>
        <ClawdSubscriptionBanner />
      </div>
    );
  }

  // Connected but not signed in
  if (!isAuthenticated) {
    if (compact) {
      return (
        <div className="mobile-scroll flex w-full min-w-0 items-center justify-end gap-1.5 overflow-x-auto sm:w-auto">
          <WalletMultiButton className="!h-8 !min-h-8 !w-auto !min-w-[112px] !max-w-[140px] !justify-center !rounded-md !bg-purple-600/60 !px-3 !text-[11px] hover:!bg-purple-700" />
          <Button
            size="sm"
            variant="default"
            className="h-8 shrink-0 bg-green-600 px-2.5 text-[11px] text-black hover:bg-green-500"
            onClick={handleSignIn}
            disabled={signing}
          >
            {signing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <LogIn className="mr-1 h-3 w-3" />
            )}
            {signing ? "Signing" : "Sign In"}
          </Button>
          {clerkEnabled && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 border-cyan-400/30 bg-black/30 px-2 text-[10px] text-cyan-200 hover:bg-cyan-500/10"
            >
              <a href={getClerkSignInUrl()}>
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clerk</span>
              </a>
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center gap-2">
        {clawdStatsView}
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <WalletMultiButton className="!w-full sm:!w-auto !justify-center !bg-purple-600/60 hover:!bg-purple-700 !text-xs !min-h-10 !rounded-md !px-4" />
          <Button
            size="sm"
            variant="default"
            className="min-h-10 w-full text-xs bg-green-600 text-black hover:bg-green-500 sm:w-auto"
            onClick={handleSignIn}
            disabled={signing}
          >
            {signing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <LogIn className="h-3 w-3 mr-1" />
            )}
            {signing ? "Signing in…" : "Sign In"}
          </Button>
        </div>
        <PhantomMobileDeepLink />
        {clerkEnabled && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 w-full gap-1.5 border-cyan-400/30 bg-black/30 text-[11px] text-cyan-200 transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-500/10 sm:w-auto"
          >
            <a href={getClerkSignInUrl()}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Link Clerk account
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {(signInStatus || error) && (
          <div className="flex flex-col items-center gap-1.5">
            <p className={`max-w-sm text-center text-[11px] ${error ? "text-red-300" : "text-green-300"}`}>
              {error || signInStatus}
            </p>
            {error?.includes("CLAWD holder") && (
              <a
                href="https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-yellow-400 underline underline-offset-2 hover:text-yellow-300"
              >
                Buy $CLAWD on Jupiter →
              </a>
            )}
          </div>
        )}
        <ClawdSubscriptionBanner />
      </div>
    );
  }

  // Authenticated
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-green-500/40 bg-green-500/5 text-green-400 hover:bg-green-500/15 hover:text-green-300 gap-1.5"
          >
            <ShieldCheck className="h-3 w-3" />
            {getUserIdentityLabel(user!)}
            {user?.isTokenGated && (
              <Badge variant="outline" className="ml-1 h-4 text-[9px] px-1 border-yellow-500/50 text-yellow-400">
                GATED
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60 bg-black/90 border-purple-500/20 text-xs"
        >
          <div className="px-2 py-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Signed in as</p>
            <p className="text-green-400 font-mono text-[11px] truncate">
              {user!.walletAddress ?? user?.profile?.displayName ?? "Social session"}
            </p>
            {!!user?.profile?.agentName && (
              <p className="text-cyan-300 text-[10px] mt-1">Agent: {user.profile.agentName}</p>
            )}
            {user?.role === "admin" && (
              <Badge variant="outline" className="mt-1 h-4 text-[9px] px-1 border-red-500/50 text-red-400">
                ADMIN
              </Badge>
            )}
            {user?.clawdBalance !== undefined && user.clawdBalance > 0 && (
              <p className="text-yellow-400/80 text-[10px] mt-1">
                {user.clawdBalance.toLocaleString()} $CLAWD
              </p>
            )}
            {!!user?.agents?.length && (
              <p className="text-purple-300/70 text-[10px] mt-1">{user.agents.length} Metaplex agent{user.agents.length === 1 ? "" : "s"}</p>
            )}
          </div>
          <DropdownMenuSeparator className="bg-purple-500/10" />
          {user?.walletAddress && (
            <DropdownMenuItem
              className="text-xs cursor-pointer hover:bg-purple-500/10 focus:bg-purple-500/10"
              onClick={copyAddress}
            >
              {copied ? (
                <Check className="h-3 w-3 mr-2 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 mr-2" />
              )}
              {copied ? "Copied!" : "Copy address"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-xs cursor-pointer hover:bg-purple-500/10 focus:bg-purple-500/10"
            onClick={() => {
              setProfileForm({
                displayName: user?.profile?.displayName ?? "",
                bio: user?.profile?.bio ?? "",
                avatarUrl: user?.profile?.avatarUrl ?? "",
                twitterUsername: user?.profile?.twitterUsername ?? "",
                githubUsername: user?.profile?.githubUsername ?? "",
                agentName: user?.profile?.agentName ?? "",
              });
              setProfileDialogOpen(true);
            }}
          >
            <Wallet className="h-3 w-3 mr-2" />
            Edit profile
          </DropdownMenuItem>
          {clerkEnabled && (
            <div className="px-2 py-1.5">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start px-2 text-xs text-cyan-200 hover:bg-purple-500/10"
              >
                <a href={getClerkUserProfileUrl()}>
                  <ShieldCheck className="mr-2 h-3 w-3" />
                  Manage Clerk account
                </a>
              </Button>
            </div>
          )}
          <DropdownMenuSeparator className="bg-purple-500/10" />
          <DropdownMenuItem
            className="text-xs cursor-pointer hover:bg-purple-500/10 focus:bg-purple-500/10"
            onClick={() => window.open("https://pay.sh", "_blank")}
          >
            <Sparkles className="h-3 w-3 mr-2 text-purple-400" />
            <span>
              Subscribe{" "}
              <span className="text-purple-400 font-mono">69,420 CLAWD/mo</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-purple-500/10" />
          <DropdownMenuItem
            className="text-xs cursor-pointer text-red-400 hover:bg-red-500/10 focus:bg-red-500/10"
            onClick={handleSignOut}
          >
            <LogOut className="h-3 w-3 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={(isAuthenticated && !user?.onboardingCompleted) || profileDialogOpen}
        onOpenChange={(open) => {
          if (user?.onboardingCompleted) {
            setProfileDialogOpen(open);
          }
        }}
      >
        <DialogContent className="sm:max-w-md border-purple-500/20 bg-black text-white">
          <DialogHeader>
            <DialogTitle>Name your agent</DialogTitle>
            <DialogDescription>
              Set the trainer profile tied to this wallet. This is stored in Neon and follows the wallet across sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Display name"
              value={profileForm.displayName}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
            />
            <Input
              placeholder="Starter agent name"
              value={profileForm.agentName}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, agentName: e.target.value }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profileForm.twitterUsername ? (
                <div className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs">
                  <Twitter className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="text-sky-300 font-mono truncate">@{profileForm.twitterUsername}</span>
                  <Check className="h-3 w-3 text-green-400 shrink-0 ml-auto" />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs border-sky-500/30 bg-sky-500/5 text-sky-300 hover:bg-sky-500/15 hover:text-sky-200 gap-2"
                  onClick={() => { window.location.href = "/api/auth/twitter-link/start"; }}
                >
                  <Twitter className="h-3.5 w-3.5" />
                  Link X / Twitter
                </Button>
              )}
              <Input
                placeholder="GitHub"
                value={profileForm.githubUsername}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, githubUsername: e.target.value }))}
              />
            </div>
            <Input
              placeholder="Avatar URL"
              value={profileForm.avatarUrl}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
            />
            <Textarea
              placeholder="Short bio"
              value={profileForm.bio}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
            />
            <Button
              className="w-full"
              onClick={handleSaveProfile}
              disabled={savingProfile || !profileForm.agentName.trim()}
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save trainer profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact variant for use in headers
export function WalletSignInCompact() {
  const { connected } = useWallet();
  const { isAuthenticated, isLoading, signIn, signOut } = useAuth();
  const [signing, setSigning] = useState(false);
  const { toast } = useToast();

  if (isLoading || !connected) return null;

  if (!isAuthenticated) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[11px] text-green-400/70 hover:text-green-300 hover:bg-green-500/10 px-2"
        onClick={async () => {
          setSigning(true);
          try { await signIn(); } catch (e: any) {
            toast({ title: "Sign-in failed", description: e?.message, variant: "destructive" });
          } finally { setSigning(false); }
        }}
        disabled={signing}
      >
        {signing ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-[11px] text-green-400 hover:text-red-400 hover:bg-red-500/10 px-2"
      onClick={async () => { await signOut(); toast({ title: "Signed out" }); }}
      title="Sign out"
    >
      <ShieldCheck className="h-3 w-3" />
    </Button>
  );
}
