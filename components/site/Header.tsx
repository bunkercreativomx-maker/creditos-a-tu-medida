"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SITE, WHATSAPP_LINK } from "@/lib/site-content";
import { WhatsAppIcon } from "./WhatsAppIcon";

const NAV_LINKS = [
  { href: "#creditos", label: "Créditos" },
  { href: "#proceso", label: "Proceso" },
  { href: "#requisitos", label: "Requisitos" },
  { href: "#ubicacion", label: "Ubicación" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-gold-500/15 bg-navy-950/85 py-2.5 backdrop-blur-xl"
          : "border-b border-transparent bg-navy-950 py-4"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight text-cream-50">
          {SITE.brand}
        </Link>
        <nav className="hidden gap-8 text-sm font-medium text-cream-50/70 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="relative py-1 transition-colors hover:text-gold-300">
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_0_0_rgba(37,211,102,0.4)] transition-all hover:bg-[#1ebe5b] hover:shadow-[0_0_24px_2px_rgba(37,211,102,0.4)]"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Escríbenos
        </a>
      </div>
    </motion.header>
  );
}
