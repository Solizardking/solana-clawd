"use client";

import {
  Code,
  Download,
  LayoutDashboard,
  LogOut,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChatHistoryList } from "@/components/chat-history-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SIDEBAR_WIDTH } from "@/constants";
import { env } from "@/env";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { useChatStorageContext } from "@/lib/chat-storage-context";
import { downloadChats } from "@/lib/download-chats";
import { cn } from "@/lib/utils";

interface LeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const FALLBACK_AVATAR = "RP";

const getInitials = (value: string) => {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};

const normalizeUrl = (url: string | undefined) => {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

export const LeftSidebar: FC<LeftSidebarProps> = ({ isOpen, onClose }) => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const {
    chats,
    currentChat,
    createChat,
    selectChat,
    updateChatTitle,
    deleteChat,
  } = useChatStorageContext();

  const baseWebUrl = normalizeUrl(env.NEXT_PUBLIC_WEB_URL);
  const loginBaseHref = baseWebUrl ? `${baseWebUrl}/login` : "/login";
  const [loginHref, setLoginHref] = useState(loginBaseHref);

  useEffect(() => {
    if (!baseWebUrl || typeof window === "undefined") {
      return;
    }

    const currentUrl = window.location.href;
    setLoginHref(
      `${baseWebUrl}/login?returnUrl=${encodeURIComponent(currentUrl)}`,
    );
  }, [baseWebUrl]);

  const displayName = user?.name || user?.email || "Account";
  const initials = useMemo(
    () => getInitials(displayName) || FALLBACK_AVATAR,
    [displayName],
  );

  const brandHref = baseWebUrl || "/";

  const handleLogout = () => {
    void logout();
  };

  // Handle download chats
  const handleDownloadChats = async () => {
    try {
      await downloadChats(chats);
    } catch (_error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "Failed to download chats. Please try again.",
      });
    }
  };

  // Filter chats - exclude blank chats
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => chat.messages.length > 0);
  }, [chats]);

  // Handle new chat creation
  const handleNewChat = () => {
    createChat();
  };

  const userMenu =
    isAuthenticated && user ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full border border-border/50"
          >
            <Avatar className="size-9">
              <AvatarImage src={user.image ?? undefined} alt={displayName} />
              <AvatarFallback>{initials || FALLBACK_AVATAR}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5 text-sm">
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href={`${baseWebUrl}/dashboard`}
              className="flex items-center gap-2"
            >
              <LayoutDashboard className="size-4" />
              Dashboard
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`${baseWebUrl}/keys`} className="flex items-center gap-2">
              <Code className="size-4" />
              API Keys
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onSelect={(event) => {
              event.preventDefault();
              handleLogout();
            }}
          >
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const showLoadingState = isLoading && !isAuthenticated;

  const headerAccountSlot = showLoadingState ? (
    <Skeleton className="size-9 rounded-full" />
  ) : (
    userMenu
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[85vw] max-w-[300px] flex-col border-r border-border bg-card px-3 py-3 text-sm text-muted-foreground transition-transform duration-250 ease-in-out sm:px-4 sm:py-4",
        isOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "-translate-x-full opacity-0 pointer-events-none",
      )}
      aria-hidden={!isOpen}
      style={{ maxWidth: SIDEBAR_WIDTH }}
    >
      <div className="flex items-center justify-between gap-2 text-foreground">
        <a
          href={brandHref}
          aria-label="Redpill home"
          className="flex items-center gap-2"
        >
          <Image
            className="dark:invert dark:hue-rotate-180"
            src="/logo-horizontal-primary.svg"
            alt="Redpill"
            width={120}
            height={32}
            priority
          />
        </a>
        <div className="flex items-center gap-2">
          {headerAccountSlot}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Collapse sidebar"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-6 flex flex-1 flex-col gap-4 min-h-0 overflow-hidden">
        {isAuthenticated && user ? null : showLoadingState ? null : (
          <Card className="mb-2">
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>
                Sign in to unlock full features and sync your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full">
                <a
                  href={loginHref}
                  className="flex items-center justify-center gap-2"
                >
                  <UserRound className="size-4" />
                  Sign in
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Chat History Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-medium text-foreground">
              Chat History
            </h3>
            <div className="flex items-center gap-1">
              {chats.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => void handleDownloadChats()}
                  title="Download all chats as ZIP"
                >
                  <Download className="size-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground px-2">
            Your chats are stored locally in this browser and won't sync to
            other devices.
          </div>
        </div>

        {/* Chat History List */}
        <div className="flex-1 min-h-0">
          <ChatHistoryList
            chats={filteredChats}
            currentChatId={currentChat?.id || null}
            onChatSelect={selectChat}
            onChatDelete={deleteChat}
            onChatRename={updateChatTitle}
            onNewChat={handleNewChat}
          />
        </div>
      </div>
    </aside>
  );
};
