import { ContactForm } from "./ContactForm";
import { SITE, WHATSAPP_LINK } from "@/lib/site-content";
import { Reveal } from "./Reveal";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function Ubicacion() {
  return (
    <section id="ubicacion" className="bg-cream-50 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <ContactForm />
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-display text-2xl font-semibold text-navy-900">Visítanos</h2>
          <div className="mt-6 space-y-5 text-ink-600">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gold-600">Dirección</h3>
              <p className="mt-1">{SITE.direccion}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gold-600">Horario</h3>
              <p className="mt-1">{SITE.horario}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gold-600">Contacto</h3>
              <p className="mt-1">Tel: {SITE.telefono}</p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 font-medium text-navy-900 hover:text-gold-600"
              >
                <WhatsAppIcon className="h-4 w-4 text-gold-600" />
                Escríbenos por WhatsApp
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
