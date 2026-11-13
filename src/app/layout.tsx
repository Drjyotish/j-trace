import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isDemo } from "@/lib/config";
import { I18nProvider } from "@/components/I18n";
import { Shell } from "@/components/Shell";

// The demo banner depends on runtime configuration, so pages are rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "J TRACE — lost & stolen phone recovery help",
  description:
    "An open-source, privacy-first recovery assistant for lost and stolen phones in India, Nepal and the UAE. Official links, ready paperwork, verified ownership — and no pretend tracking.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5d57",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <Shell demo={isDemo()}>{children}</Shell>
        </I18nProvider>
      </body>
    </html>
  );
}
