import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "AGENT-DEPLOY — Deploy HTML sites with AI agents",
  description:
    "A deployment platform for static HTML sites. Deploy from the browser or let AI agents manage your sites through the Agent Auth Protocol.",
};

export const viewport: Viewport = {
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "!bg-card !text-foreground !border-border",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
