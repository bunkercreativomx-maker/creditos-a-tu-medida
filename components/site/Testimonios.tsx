import { Reveal } from "./Reveal";

const TESTIMONIOS = [
  {
    nombre: "Martha G.",
    sector: "Pensionada ISSSTE",
    img: "/fotos/testimonio-mujer.webp",
    frase:
      "Me sorprendió lo rápido. Solicité por WhatsApp en la mañana y antes de las 3 de la tarde ya tenía mi crédito aprobado y depositado. Muy atentos conmigo.",
  },
  {
    nombre: "Jorge R.",
    sector: "Trabajador de gobierno",
    img: "/fotos/testimonio-hombre.webp",
    frase:
      "Proceso muy sencillo, sin tanta vuelta. Me explicaron todo y el dinero cayó el mismo día. Lo recomiendo con confianza.",
  },
];

export function Testimonios() {
  return (
    <section className="bg-navy-950 py-20 text-cream-50 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
            Testimonios
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Clientes reales, resultados reales
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {TESTIMONIOS.map((t, i) => (
            <Reveal key={t.nombre} delay={i * 0.1}>
              <figure className="flex h-full flex-col items-center gap-5 rounded-3xl border border-cream-50/10 bg-white/5 p-8 text-center">
                <div className="h-24 w-24 overflow-hidden rounded-full ring-2 ring-gold-500/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.img}
                    alt={`Cliente ${t.nombre}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <blockquote className="text-base leading-relaxed text-cream-50/85">
                  “{t.frase}”
                </blockquote>
                <figcaption>
                  <div className="font-display font-semibold text-gold-300">{t.nombre}</div>
                  <div className="mt-0.5 text-sm text-cream-50/60">{t.sector}</div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
