import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, themeScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "TOSS TMS", template: "%s · TOSS TMS" },
  description: "Trucking One Stop Shop — dispatch, fleet and billing",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "TOSS TMS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
