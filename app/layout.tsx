import type { Metadata } from "next";
import { Source_Serif_4, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sourceSerif4 = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  axes: ["opsz"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wildwood Waitlist",
  description: "Waitlist and enrollment management for Wildwood",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif4.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-bg text-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
