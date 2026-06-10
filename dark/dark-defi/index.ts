export interface DarkDefiSurface {
  id: "vault" | "yield" | "risk";
  title: string;
  subtitle: string;
  bullets: string[];
}

export const DARK_DEFI_SURFACES: DarkDefiSurface[] = [
  {
    id: "vault",
    title: "Private vault",
    subtitle: "Track shielded balance and note flow in one place.",
    bullets: [
      "Shows committed balance and staged notes",
      "Supports shield / unshield staging",
      "Keeps a local audit trail for each move",
    ],
  },
  {
    id: "yield",
    title: "Yield watch",
    subtitle: "Keep an eye on low-risk deployment lanes.",
    bullets: [
      "Collects vault and LP ideas into one screen",
      "Can surface conservative reserve targets",
      "Ties route risk to vault policy",
    ],
  },
  {
    id: "risk",
    title: "Risk rail",
    subtitle: "Shows what would block the next move.",
    bullets: [
      "Flags unsupported tokens and tight slippage",
      "Warns when memo or recipient data is malformed",
      "Stops the flow before it leaves the screen",
    ],
  },
];

export const DARK_DEFI_NOTES = [
  "Dark DeFi is intentionally conservative until the protocol surface is ready.",
  "The wallet keeps the UX now and swaps in deeper mechanics later.",
];

