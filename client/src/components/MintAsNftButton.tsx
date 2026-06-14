import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Stamp, Loader2, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface MintNftPayload {
  name: string;
  description?: string;
  imageUrl: string;
  collectionAddress?: string;
  attributes?: { trait_type: string; value: string | number }[];
}

interface Props {
  payload: MintNftPayload;
  size?: "icon" | "sm" | "default";
  className?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  label?: string;
}

export function MintAsNftButton({
  payload,
  size = "icon",
  className,
  variant = "secondary",
  label,
}: Props) {
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [minted, setMinted] = useState<{ assetAddress: string; explorerUrl: string } | null>(null);
  const wallet = publicKey?.toBase58();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect wallet first");
      const d = await apiRequest<{ assetAddress: string; explorerUrl: string }>("POST", "/api/nft/create", {
        ...payload,
        ownerAddress: wallet,
      });
      return d;
    },
    onSuccess: (d) => {
      setMinted({ assetAddress: d.assetAddress, explorerUrl: d.explorerUrl });
      toast({
        title: "NFT minted",
        description: `${payload.name} → ${d.assetAddress.slice(0, 8)}…`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Mint failed", description: e?.message, variant: "destructive" }),
  });

  if (minted) {
    return (
      <Button
        type="button" size={size} variant="outline"
        className={cn("gap-1 border-emerald-500/40", className)}
        asChild
      >
        <a href={minted.explorerUrl} target="_blank" rel="noreferrer">
          <Check className="h-4 w-4 text-emerald-500" />
          {label !== undefined ? <span className="text-xs">Minted</span> : null}
          {label && <ExternalLink className="h-3 w-3" />}
        </a>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={mutation.isPending || !wallet}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); mutation.mutate(); }}
      className={cn("gap-1", className)}
      title={wallet ? "Mint as Metaplex Core NFT" : "Connect wallet to mint"}
      data-testid="button-mint-nft"
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Stamp className="h-4 w-4" />
      )}
      {label && <span className="text-xs">{mutation.isPending ? "Minting…" : label}</span>}
    </Button>
  );
}
