import { ICONS } from "./icons";
import { BENEFICIOS } from "@/lib/site-content";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";

export function Beneficios() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Ventajas</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
            ¿Por qué elegirnos?
          </h2>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map((b) => {
            const Icon = ICONS[b.icon];
            return (
              <RevealItem key={b.titulo}>
                <div className="group h-full rounded-2xl border border-navy-900/8 bg-white p-7 text-center transition-all duration-300 hover:-translate-y-1 hover:border-gold-400/40 hover:shadow-[0_20px_40px_-16px_rgba(10,22,40,0.15)]">
                  <Icon className="mx-auto h-14 w-14 transition-transform duration-300 group-hover:scale-105" />
                  <h3 className="mt-4 font-display text-base font-semibold text-navy-900">{b.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{b.descripcion}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
