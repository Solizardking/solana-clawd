import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Stripe Agents — Let AI agents pay with your card",
  description: "Bring your own card. AI agents request payments, you approve every transaction.",
};
export const viewport: Viewport = { maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "!bg-card !text-card-foreground !border-border !shadow-md",
          }}
        />
      </body>
    </html>
  );
}
