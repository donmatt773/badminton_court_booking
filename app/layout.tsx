import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppApolloProvider } from "@/lib/client/apollo-client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Court Booking",
  description: "Book badminton courts with a modern reservation experience.",
  icons: {
    icon: "/assets/tab-icon.png",
    shortcut: "/assets/tab-icon.png",
    apple: "/assets/tab-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppApolloProvider>{children}</AppApolloProvider>
      </body>
    </html>
  );
}
