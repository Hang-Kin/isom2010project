import type { Metadata } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Evidence Vault",
    template: "%s · Evidence Vault",
  },
  description:
    "Store your awards and activities once, then export evidence packets for any application.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
