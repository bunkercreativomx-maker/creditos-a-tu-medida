import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { FloatingWhatsApp } from "@/components/site/FloatingWhatsApp";
import { MetaPixel } from "@/components/site/MetaPixel";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Créditos a tu medida | Créditos vía nómina",
  description:
    "Créditos vía nómina para pensionados, jubilados, gobierno y educación, en alianza con Financiera Fortaleza. Aprobación rápida, sin complicaciones.",
  // Verificación de dominio de Meta (Business Manager > Seguridad de la marca > Dominios > Meta-tag)
  ...(process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION
    ? { other: { "facebook-domain-verification": process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream-50 font-sans text-ink-900">
        {children}
        <FloatingWhatsApp />
        <MetaPixel />
      </body>
    </html>
  );
}
