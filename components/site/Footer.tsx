import { SITE, WHATSAPP_LINK } from "@/lib/site-content";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function Footer() {
  return (
    <footer className="bg-navy-950 py-14 text-cream-50/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-display text-lg font-semibold text-cream-50">{SITE.brand}</p>
            <p className="mt-3 text-sm leading-relaxed">
              Promotor de crédito vía nómina para pensionados y jubilados.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold-400">Contáctanos</h4>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe5b]"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Escríbenos por WhatsApp
            </a>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold-400">Legales</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="/privacidad" className="hover:text-gold-300">
                  Aviso de Privacidad
                </a>
              </li>
              <li>
                <a href="https://www.buro.gob.mx" target="_blank" rel="noopener noreferrer" className="hover:text-gold-300">
                  Consulta financieras en el Buró de Entidades Financieras (CONDUSEF)
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-cream-50/10 pt-6 text-xs text-cream-50/40">
          <p>
            {SITE.brand} — Todos los derechos reservados {new Date().getFullYear()}.
          </p>
          {/* Somos asesores (promotores) independientes: nunca publicar CAT, tasas ni comisiones propias. */}
          <p className="mt-1">
            Créditos a tu medida es un asesor independiente de crédito vía nómina: te ayudamos con todo
            el trámite y no cobramos por la asesoría. No otorgamos créditos; el crédito lo otorga una
            entidad financiera y está sujeto a su aprobación. Las condiciones del crédito las define la
            financiera y vienen en tu contrato. No estamos afiliados al IMSS, ISSSTE, CFE, Pemex ni al
            SNTE. Requisitos y condiciones en creditoatumedida.com.
          </p>
        </div>
      </div>
    </footer>
  );
}
