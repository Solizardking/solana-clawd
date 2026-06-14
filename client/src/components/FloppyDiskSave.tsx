import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface FloppyDiskSavePayload {
  galleryId?: string;
  kind: "image" | "video" | "music";
  prompt: string;
  enhancedPrompt?: string;
  mode?: string;
  model?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
}

interface Props {
  payload: FloppyDiskSavePayload;
  size?: "icon" | "sm" | "default";
  className?: string;
  variant?: "default" | "ghost" | "outline" | "secondary";
}

export function FloppyDiskSave({ payload, size = "icon", className, variant = "secondary" }: Props) {
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [savedFlash, setSavedFlash] = useState(false);

  const wallet = publicKey?.toBase58();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect wallet to save");
      const r = await apiRequest("POST", "/api/imagine/save", {
        walletAddress: wallet,
        saved: true,
        ...payload,
      });
      return r.json();
    },
    onSuccess: () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      qc.invalidateQueries({ queryKey: ["/api/imagine/library", wallet] });
      toast({ title: "Saved", description: "Stashed in your wallet vault." });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message || "Try again", variant: "destructive" });
    },
  });

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={mutation.isPending || !wallet}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); mutation.mutate(); }}
      className={cn(
        "group relative transition-transform active:scale-90",
        savedFlash && "bg-emerald-500/30 ring-2 ring-emerald-400",
        className
      )}
      title={wallet ? "Save to your vault" : "Connect wallet to save"}
      data-testid="button-floppy-save"
    >
      <span className="relative inline-flex items-center justify-center">
        {savedFlash ? (
          <Check className="h-4 w-4 animate-in zoom-in-50 duration-300" />
        ) : (
          <Save className={cn(
            "h-4 w-4 transition-transform duration-200",
            "group-hover:-translate-y-0.5 group-hover:rotate-[-6deg]",
            mutation.isPending && "animate-pulse"
          )} />
        )}
      </span>
    </Button>
  );
}
