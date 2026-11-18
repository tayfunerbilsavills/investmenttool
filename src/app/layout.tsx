import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investment Tool",
  description: "Ankaufsprüfung, DCF-light, Sensitivitäten und Broker Opinion of Value",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3B2A20" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head />
      <body>{children}</body>
    </html>
  );
}
