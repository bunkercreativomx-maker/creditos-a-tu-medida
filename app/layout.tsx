import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { FloatingWhatsApp } from "@/components/site/FloatingWhatsApp";
import { MetaPixel } from "@/components/site/MetaPixel";
import { SITE } from "@/lib/site-content";

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
  metadataBase: new URL("https://creditoatumedida.com"),
  title: "Créditos a tu medida | Créditos vía nómina",
  description:
    "Créditos vía nómina para pensionados, jubilados, gobierno y educación, en alianza con Financiera Fortaleza. Aprobación rápida, sin complicaciones.",
  // Verificación de dominio de Meta (Business Manager > Seguridad de la marca > Dominios > Meta-tag)
  ...(process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION
    ? { other: { "facebook-domain-verification": process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION } }
    : {}),
};

const LOCAL_BUSINESS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FinancialService",
  name: SITE.brand,
  url: "https://creditoatumedida.com",
  logo: "https://creditoatumedida.com/icon-512.png",
  image: "https://creditoatumedida.com/icon-512.png",
  telephone: "+52 656 374 8899",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Benjamín Franklin 3220, Int 22-D, Zona Pronaf",
    postalCode: "32315",
    addressLocality: "Ciudad Juárez",
    addressRegion: "Chihuahua",
    addressCountry: "MX",
  },
  areaServed: { "@type": "City", name: "Ciudad Juárez" },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream-50 font-sans text-ink-900">
        <script
          type="application/ld+json"
          // Datos estructurados (FinancialService / LocalBusiness) — solo datos verificados de lib/site-content.ts.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSONLD) }}
        />
        {children}
        <FloatingWhatsApp />
        <MetaPixel />
      </body>
    </html>
  );
}
