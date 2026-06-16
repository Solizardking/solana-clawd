"use client";

import { Moon, Sun, X } from "lucide-react";
import type { FC } from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RIGHT_PANEL_WIDTH, TITLE_GENERATION_MODEL } from "@/constants";
import type { ThemeOption } from "@/hooks/use-chat-settings";
import { useChatSettings } from "@/hooks/use-chat-settings";
import { cn } from "@/lib/utils";

interface SettingSidebarProps {
  isVisible: boolean;
  onClose: () => void;
}

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
];

const MIN_MESSAGES = 1;
const MAX_MESSAGES = 50;

export const SettingSidebar: FC<SettingSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const theme = useChatSettings((state) => state.theme);
  const setTheme = useChatSettings((state) => state.setTheme);
  const messagesInContext = useChatSettings((state) => state.messagesInContext);
  const setMessagesInContext = useChatSettings(
    (state) => state.setMessagesInContext,
  );
  const responseLanguage = useChatSettings((state) => state.responseLanguage);
  const setResponseLanguage = useChatSettings(
    (state) => state.setResponseLanguage,
  );
  const temperature = useChatSettings((state) => state.temperature);
  const setTemperature = useChatSettings((state) => state.setTemperature);
  const maxTokens = useChatSettings((state) => state.maxTokens);
  const setMaxTokens = useChatSettings((state) => state.setMaxTokens);
  const autoGenerateTitles = useChatSettings(
    (state) => state.autoGenerateTitles,
  );
  const setAutoGenerateTitles = useChatSettings(
    (state) => state.setAutoGenerateTitles,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const apply = (selected: ThemeOption) => {
      const shouldUseDark = selected === "dark";
      root.classList.toggle("dark", shouldUseDark);
      root.dataset.theme = shouldUseDark ? "dark" : "light";
    };

    apply(theme);
  }, [theme]);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-[90vw] max-w-[345px] flex-col border-l border-border bg-muted px-3 py-3 text-sm transition-transform duration-250 ease-in-out sm:px-4 sm:py-4",
        isVisible
          ? "pointer-events-auto translate-x-0 opacity-100"
          : "pointer-events-none translate-x-full opacity-0",
      )}
      aria-hidden={!isVisible}
      style={{ maxWidth: RIGHT_PANEL_WIDTH }}
    >
      <header className="flex items-center justify-between gap-2 text-foreground">
        <div>
          <h2 className="text-base font-semibold">Settings</h2>
          <p className="text-xs text-muted-foreground">
            Personalise how you work with RedPill.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close settings sidebar"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="mt-4 flex-1 overflow-y-auto pb-2">
        <div className="space-y-4">
          <Card className="gap-4">
            <CardHeader className="pb-0">
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-1">
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Switch between light or dark modes.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              >
                <span className="flex items-center gap-2">
                  {theme === "light" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                  {theme === "light" ? "Light mode" : "Dark mode"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {theme === "light" ? "Switch to dark" : "Switch to light"}
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader className="pb-0">
              <CardTitle>Chat Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Messages in Context</p>
                  <p className="text-xs text-muted-foreground">
                    How many recent messages are sent to the model (1-50).
                  </p>
                </div>
                <div>
                  <Label htmlFor="messages-in-context" className="sr-only">
                    Messages in context
                  </Label>
                  <Input
                    id="messages-in-context"
                    type="number"
                    inputMode="numeric"
                    min={MIN_MESSAGES}
                    max={MAX_MESSAGES}
                    value={messagesInContext}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (!Number.isNaN(value)) {
                        setMessagesInContext(value);
                      }
                    }}
                    onBlur={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) {
                        setMessagesInContext(MIN_MESSAGES);
                        return;
                      }
                      const clamped = Math.min(
                        Math.max(value, MIN_MESSAGES),
                        MAX_MESSAGES,
                      );
                      if (clamped !== messagesInContext) {
                        setMessagesInContext(clamped);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Response Language</p>
                  <p className="text-xs text-muted-foreground">
                    Choose the language preferred for AI replies.
                  </p>
                </div>
                <Select
                  value={responseLanguage}
                  onValueChange={setResponseLanguage}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {LANGUAGE_OPTIONS.map((language) => (
                      <SelectItem key={language} value={language}>
                        {language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Chat Titles</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-name new chats with the TEE model{" "}
                    <span className="font-medium text-foreground">
                      {TITLE_GENERATION_MODEL}
                    </span>
                    .
                  </p>
                </div>
                <Switch
                  checked={autoGenerateTitles}
                  onCheckedChange={setAutoGenerateTitles}
                  aria-label="Toggle automatic chat titles"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader className="pb-0">
              <CardTitle>Model Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Temperature</p>
                  <p className="text-xs text-muted-foreground">
                    Controls randomness in responses (0-2). Higher values make
                    output more creative.
                  </p>
                </div>
                <div>
                  <Label htmlFor="temperature" className="sr-only">
                    Temperature
                  </Label>
                  <Input
                    id="temperature"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="2"
                    value={temperature}
                    onChange={(event) => {
                      const value = Number.parseFloat(event.target.value);
                      if (!Number.isNaN(value)) {
                        setTemperature(value);
                      }
                    }}
                    onBlur={(event) => {
                      const value = Number.parseFloat(event.target.value);
                      if (Number.isNaN(value)) {
                        setTemperature(0.7);
                        return;
                      }
                      const clamped = Math.min(Math.max(value, 0), 2);
                      if (clamped !== temperature) {
                        setTemperature(clamped);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Max Tokens</p>
                  <p className="text-xs text-muted-foreground">
                    Maximum tokens in response (1-8192). Higher values allow
                    longer responses.
                  </p>
                </div>
                <div>
                  <Label htmlFor="max-tokens" className="sr-only">
                    Max Tokens
                  </Label>
                  <Input
                    id="max-tokens"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="8192"
                    value={maxTokens}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (!Number.isNaN(value)) {
                        setMaxTokens(value);
                      }
                    }}
                    onBlur={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) {
                        setMaxTokens(4096);
                        return;
                      }
                      const clamped = Math.min(Math.max(value, 1), 8192);
                      if (clamped !== maxTokens) {
                        setMaxTokens(clamped);
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </aside>
  );
};
