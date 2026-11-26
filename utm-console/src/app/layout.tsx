import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UTM Console — KK Create",
  description: "UTM links, calendar and sales attribution for the AI Course and Creator Bootcamp.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
