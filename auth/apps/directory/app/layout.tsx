import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent-auth.directory";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AGENT-AUTH — Directory",
    template: "%s — AGENT-AUTH Directory",
  },
  description:
    "A searchable directory of Agent Auth-capable services. Discover providers by intent.",
  applicationName: "Agent-Auth Directory",
  keywords: ["agent auth", "agent authentication", "AI agents", "OAuth", "MCP", "directory"],
  openGraph: {
    type: "website",
    siteName: "Agent-Auth Directory",
    url: SITE_URL,
    title: "AGENT-AUTH — Directory",
    description:
      "A searchable directory of Agent Auth-capable services. Discover providers by intent.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AGENT-AUTH — Directory",
    description:
      "A searchable directory of Agent Auth-capable services. Discover providers by intent.",
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontMono.variable} min-h-dvh font-sans antialiased`}>
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
