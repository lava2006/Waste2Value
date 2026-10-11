import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/ui/AppShell";

export const metadata: Metadata = {
  title: "Waste2Value — Turn Waste Into Verified Value",
  description:
    "AI-powered circular intelligence platform reconciling e-waste recycling claims against evidence and issuing verifiable Circularity Passports.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="font-sans min-h-full antialiased transition-colors">
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
