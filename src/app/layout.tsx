import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { NativeShell } from "@/components/native-shell";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const inter = localFont({
  src: "../fonts/inter-latin.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});
const montserrat = localFont({
  src: "../fonts/montserrat-latin.woff2",
  variable: "--font-montserrat",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: { default: "Mori", template: "%s · Mori" },
  description: "A calm planning companion that protects your time.",
  applicationName: "Mori",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Mori" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6fa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${montserrat.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        {children}
        <NativeShell />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
