import { ICONS } from "./icons";
import { TIPOS_CREDITO, WHATSAPP_LINK } from "@/lib/site-content";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function TiposCredito() {
  return (
    <section id="creditos" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">Nuestros productos</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
          Nuestros tipos de crédito
        </h2>
        <p className="mt-3 text-ink-600">Encuentra el crédito que mejor se adapta a tus necesidades</p>
      </Reveal>

      <RevealGroup className="mt-14 grid gap-6 sm:grid-cols-2">
        {TIPOS_CREDITO.map((tipo) => {
          const Icon = ICONS[tipo.icon];
          return (
            <RevealItem key={tipo.titulo}>
              <div className="group relative flex h-full flex-col items-center overflow-hidden rounded-3xl border border-navy-900/8 bg-white p-10 text-center shadow-[0_1px_2px_rgba(10,22,40,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-gold-400/40 hover:shadow-[0_20px_50px_-12px_rgba(10,22,40,0.15)]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-100 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <Icon className="relative h-16 w-16" />
                <h3 className="relative mt-6 font-display text-xl font-semibold text-navy-900">{tipo.titulo}</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-ink-600">{tipo.descripcion}</p>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-navy-800"
                >
                  <WhatsAppIcon className="h-4 w-4 text-gold-300" />
                  Solicitar por WhatsApp
                </a>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}
