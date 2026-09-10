import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "BullGPT — Chart analysis", description: "Structured AI decision support for chart setups." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
