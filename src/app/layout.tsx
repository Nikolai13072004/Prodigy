import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { getPlatformBranding } from "@/lib/platform-settings";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding();

  return {
    title: branding.siteName,
    description: branding.siteDescription,
    icons: branding.faviconUrl
      ? {
          icon: branding.faviconUrl,
          shortcut: branding.faviconUrl,
          apple: branding.faviconUrl,
        }
      : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-900">
        <Providers>
          <AppShell>{children}</AppShell>
          <ScrollToTopButton />
        </Providers>
      </body>
    </html>
  );
}
