import { ICONS } from "./icons";
import { PROCESO } from "@/lib/site-content";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";

export function Proceso() {
  return (
    <section id="proceso" className="relative overflow-hidden bg-navy-950 py-20 text-cream-50 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: "radial-gradient(50% 60% at 50% 0%, rgba(201,162,39,0.12) 0%, rgba(201,162,39,0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Cómo funciona</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Proceso de <span className="italic text-gold-300">solicitud</span>
          </h2>
          <p className="mt-3 text-cream-50/60">Fácil. Rápido. Seguro.</p>
        </Reveal>

        <RevealGroup className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESO.map((paso, i) => {
            const Icon = ICONS[paso.icon];
            return (
              <RevealItem key={paso.titulo} className="relative flex flex-col items-center text-center">
                {i < PROCESO.length - 1 && (
                  <div className="absolute left-[calc(50%+2.5rem)] top-8 hidden h-px w-[calc(100%-5rem)] bg-gradient-to-r from-gold-500/40 to-transparent lg:block" />
                )}
                <div className="relative">
                  <Icon className="h-16 w-16" />
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-navy-950">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-display font-semibold">{paso.titulo}</h3>
                <p className="mt-1.5 text-sm text-cream-50/55">{paso.descripcion}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
