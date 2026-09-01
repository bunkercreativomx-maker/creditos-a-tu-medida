"use client";

import { motion } from "framer-motion";
import { SECTORES, WHATSAPP_LINK } from "@/lib/site-content";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { AnimatedCounter } from "./AnimatedCounter";
import { Countdown } from "./Countdown";

const ease = [0.22, 1, 0.36, 1] as const;

const STATS = [
  { value: 20, suffix: "+", label: "años en el mercado" },
  { value: 15, suffix: "h", label: "para tu crédito el mismo día" },
  { value: 100, suffix: "%", label: "financiera mexicana" },
];

export function Hero() {
  return (
    <section className="relative min-h-[92vh] overflow-hidden bg-navy-950 text-cream-50">
      {/* Foto real como fondo, fundida con el diseño */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fotos/hero-bg.webp"
          alt="Cliente pensionado satisfecho revisando su crédito aprobado"
          className="h-full w-full object-cover object-[75%_center]"
        />
        {/* Degradado oscuro desde la izquierda para legibilidad y fusión */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/20" />
        {/* Velo sutil para unificar la foto con el fondo */}
        <div className="absolute inset-0 bg-navy-950/30" />
        {/* Textura sutil de cuadrícula */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-center px-4 py-24 sm:px-6">
        <div className="flex max-w-2xl flex-col items-start gap-7">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gold-300"
          >
            Financiera Fortaleza · 100% mexicana · 20+ años
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease }}
            className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Tu crédito aprobado y depositado <br />
            <span className="italic text-gold-300">el mismo día</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease }}
            className="max-w-xl text-lg leading-relaxed text-cream-50/85"
          >
            Créditos para {SECTORES.join(", ")} de instituciones con convenio. Sin complicaciones,
            sin comisiones ocultas, con asesoría personalizada de principio a fin.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease }}
          >
            <Countdown />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease }}
            className="max-w-md text-base leading-relaxed text-cream-50/80"
          >
            Solicita antes de las 3:00 pm y recibe tu crédito el mismo día. Después de esa hora,
            tu crédito se deposita al día siguiente.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease }}
          >
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-full bg-[#25D366] px-7 py-3.5 text-base font-semibold text-white shadow-[0_8px_30px_-4px_rgba(37,211,102,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1ebe5b] hover:shadow-[0_12px_40px_-4px_rgba(37,211,102,0.65)]"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Solicita por WhatsApp
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-2 grid w-full max-w-md grid-cols-3 gap-6 border-t border-cream-50/10 pt-6"
          >
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="font-display text-2xl font-semibold text-gold-300 sm:text-3xl">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </div>
                <p className="mt-1 text-xs leading-snug text-cream-50/70">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
