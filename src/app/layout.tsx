import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Sans, IBM_Plex_Mono, Onest } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { getPlatformBranding } from "@/lib/platform-settings";
import "./globals.css";

// Дизайн-язык Trenning: IBM Plex Sans (интерфейс), Onest (заголовки),
// IBM Plex Mono (числа/коды). Все три с кириллицей.
const ibmSans = IBM_Plex_Sans({
  variable: "--font-ibm-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
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
      suppressHydrationWarning
      className={`${ibmSans.variable} ${ibmMono.variable} ${onest.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
        <Script id="theme-init" strategy="beforeInteractive">
          {"(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();"}
        </Script>
        <Providers>
          <AppShell>{children}</AppShell>
          <ScrollToTopButton />
        </Providers>
      </body>
    </html>
  );
}
