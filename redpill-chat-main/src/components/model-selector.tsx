"use client";

import { useEffect } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useChatSettings } from "@/hooks/use-chat-settings";
import { getModelProviderIcon, isGpuTeeModel } from "@/lib/utils";
import { useModelsStore } from "@/state/models";

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSelector({ open, onOpenChange }: ModelSelectorProps) {
  const setModel = useChatSettings((state) => state.setModel);
  const models = useModelsStore((state) => state.models);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onOpenChange]);

  const modelOptions = models.map((m) => {
    const providerFromName =
      m.id.split("/")[0]?.trim() || m.providers[0] || "unknown";
    return {
      value: m.id,
      label: m.name,
      provider: providerFromName,
      iconUrl: getModelProviderIcon(providerFromName),
      isGpuTee: isGpuTeeModel(m.providers),
    };
  });

  const handleModelSelect = (value: string) => {
    setModel(value);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search models..." />
      <CommandList>
        <CommandEmpty>No models found.</CommandEmpty>
        <CommandGroup>
          {modelOptions.map((option) => (
            <CommandItem
              key={option.value}
              value={option.label}
              onSelect={() => handleModelSelect(option.value)}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="size-5 flex items-center justify-center rounded overflow-hidden bg-white border flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={option.iconUrl}
                    alt={option.provider}
                    className="size-4 object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span>{option.label}</span>
                  {option.isGpuTee && (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-300/20">
                      GPU TEE
                    </span>
                  )}
                </div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
