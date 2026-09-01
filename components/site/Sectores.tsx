import { REQUISITOS, WHATSAPP_LINK } from "@/lib/site-content";
import { Reveal } from "./Reveal";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function Sectores() {
  return (
    <section id="requisitos" className="bg-cream-100 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-2">
        <Reveal className="rounded-3xl border border-navy-900/8 bg-white p-8 shadow-[0_1px_2px_rgba(10,22,40,0.04)] sm:p-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-600">
              <CheckBadge />
            </span>
            <h2 className="font-display text-xl font-semibold text-navy-900">Instituciones que atendemos</h2>
          </div>
          <p className="mt-3 text-sm text-ink-600">
            Créditos vía nómina para trabajadores y pensionados de instituciones con convenio.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {[
              { nombre: "Pensionados", img: "/fotos/sector-pensionado.webp" },
              { nombre: "Jubilados", img: "/fotos/sector-jubilado.webp" },
              { nombre: "Gobierno", img: "/fotos/sector-gobierno.webp" },
              { nombre: "Educación", img: "/fotos/sector-educacion.webp" },
            ].map((sector) => (
              <li
                key={sector.nombre}
                className="group overflow-hidden rounded-xl border border-navy-900/8 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative h-24 w-full overflow-hidden bg-cream-100 sm:h-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sector.img}
                    alt={`Cliente ${sector.nombre.toLowerCase()}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="px-3 py-2.5 text-center font-medium text-navy-900">
                  {sector.nombre}
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="rounded-3xl border border-navy-900/8 bg-white p-8 shadow-[0_1px_2px_rgba(10,22,40,0.04)] sm:p-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-600">
              <DocBadge />
            </span>
            <h2 className="font-display text-xl font-semibold text-navy-900">Documentos necesarios</h2>
          </div>
          <ul className="mt-6 space-y-3">
            {REQUISITOS.map((req) => (
              <li key={req} className="flex items-start gap-2.5 text-sm text-ink-600">
                <span className="mt-0.5 text-gold-600">✓</span>
                {req}
              </li>
            ))}
          </ul>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe5b]"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Solicita por WhatsApp
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function CheckBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
