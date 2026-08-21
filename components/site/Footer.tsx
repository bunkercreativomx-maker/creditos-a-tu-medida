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
              Promotor de crédito vía nómina, en alianza con {SITE.financiera}.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold-400">Contáctanos</h4>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-2 text-sm hover:text-gold-300"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Escríbenos por WhatsApp
            </a>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gold-400">Legales</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Política de tratamiento de datos</li>
              <li>Aviso de Privacidad Integral</li>
              <li>Unidad Especializada de Atención (UNE)</li>
              <li>
                <a href="https://www.buro.gob.mx" target="_blank" rel="noopener noreferrer" className="hover:text-gold-300">
                  Buró de Entidades Financieras (CONDUSEF)
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-cream-50/10 pt-6 text-xs text-cream-50/40">
          <p>
            {SITE.financiera} — Todos los derechos reservados {new Date().getFullYear()}.
          </p>
          {/* TODO: sustituir por el CAT, tasa de interés y avisos regulatorios reales
              confirmados con Financiera Fortaleza antes de publicar el sitio — son
              cifras reguladas por CONDUSEF y no deben inventarse. */}
          <p className="mt-1">
            Costo Anual Total (CAT) y tasa de interés aplicable sujetos a evaluación individual —
            consulta con tu asesor. Somos un organismo regulado por CONDUSEF y CNBV.
          </p>
        </div>
      </div>
    </footer>
  );
}
