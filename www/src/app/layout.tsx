import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Messaging",
  description:
    "End-to-end encrypted messaging platform, powered by sigmalearning.academy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-300">{children}</body>
    </html>
  );
}
