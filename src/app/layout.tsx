import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const inter = localFont({ src: "../fonts/inter-latin.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });
const montserrat = localFont({ src: "../fonts/montserrat-latin.woff2", variable: "--font-montserrat", display: "swap", weight: "100 900" });

export const metadata: Metadata = { title: { default: "Kairos", template: "%s · Kairos" }, description: "A conversational secretary that protects your time.", applicationName: "Kairos", appleWebApp: { capable: true, statusBarStyle: "default", title: "Kairos" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f9f9f9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${montserrat.variable}`} data-scroll-behavior="smooth"><body>{children}<ServiceWorkerRegister /></body></html>;
}
