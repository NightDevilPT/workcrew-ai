import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const nunitoSans = Nunito_Sans({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Workcrew AI",
  description: "Workcrew AI is a platform that helps you manage your work and collaborate with your team using AI-powered tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", nunitoSans.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
