import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SDS Flow",
  description:
    "SDS Flow helps you create, send, and track quotations and invoices with a mobile-first workflow.",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              success:
                "!bg-[#E8F5E9] !text-green-900 !border !border-green-200 [&_[data-description]]:!text-green-800",
              error:
                "!bg-[#FFEBEE] !text-red-900 !border !border-red-200 [&_[data-description]]:!text-red-800",
              info: "!bg-[#E3F2FD] !text-blue-900 !border !border-blue-200 [&_[data-description]]:!text-blue-800",
              default:
                "!bg-[#E3F2FD] !text-blue-900 !border !border-blue-200 [&_[data-description]]:!text-blue-800",
            },
          }}
        />
      </body>
    </html>
  );
}
