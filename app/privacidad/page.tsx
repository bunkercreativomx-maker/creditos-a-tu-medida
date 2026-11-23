import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SITE } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Aviso de Privacidad | Créditos a tu medida",
  description: "Aviso de Privacidad de Créditos a tu medida, asesor independiente de crédito vía nómina.",
  alternates: { canonical: "/privacidad" },
};

const ACTUALIZADO = "23 de noviembre de 2026";

export default function Privacidad() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-cream-50 py-16 sm:py-20">
        <article className="mx-auto max-w-3xl space-y-6 px-4 text-ink-700 sm:px-6 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy-900 [&_li]:ml-5 [&_li]:list-disc">
          <h1 className="font-display text-3xl font-semibold text-navy-900 sm:text-4xl">Aviso de Privacidad</h1>
          <p className="text-sm text-ink-500">Última actualización: {ACTUALIZADO}</p>

          <h2>1. Responsable</h2>
          <p>
            {SITE.brand} (en adelante, &quot;nosotros&quot;), asesor independiente de crédito vía nómina, con domicilio en{" "}
            {SITE.direccion}, es responsable del tratamiento de sus datos personales conforme a la Ley Federal de
            Protección de Datos Personales en Posesión de los Particulares.
          </p>

          <h2>2. Datos que recabamos</h2>
          <p>Por el formulario de este sitio, por WhatsApp o en nuestra oficina podemos recabar:</p>
          <ul>
            <li>Identificación y contacto: nombre, apellidos, fecha de nacimiento, CURP, teléfono, WhatsApp y correo electrónico.</li>
            <li>Datos de su pensión o empleo: institución, número de pensión o de seguridad social (NSS).</li>
            <li>Datos patrimoniales y financieros: monto aproximado que necesita, banco donde recibe su pago y documentos como comprobante de ingresos y de domicilio.</li>
            <li>Copia de su identificación oficial (INE).</li>
          </ul>
          <p>
            Los datos patrimoniales y financieros requieren su consentimiento expreso. Al enviar el formulario o
            compartirnos esos datos por WhatsApp, usted nos otorga ese consentimiento.
          </p>

          <h2>3. Para qué usamos sus datos</h2>
          <p>Finalidades necesarias:</p>
          <ul>
            <li>Contactarlo y asesorarlo sobre opciones de crédito vía nómina.</li>
            <li>Integrar su expediente y gestionar su solicitud de crédito ante la entidad financiera.</li>
            <li>Agendar citas y darle seguimiento a su trámite.</li>
          </ul>
          <p>
            Finalidad secundaria: enviarle información sobre renovaciones u otras opciones de crédito. Si no desea
            recibirla, díganoslo por WhatsApp o en la oficina; esto no afecta su trámite.
          </p>

          <h2>4. Con quién compartimos sus datos</h2>
          <p>
            Para tramitar su crédito, compartimos sus datos con la entidad financiera que evaluará y, en su caso,
            otorgará el crédito. Esta transferencia es necesaria para el trámite que usted solicita. No vendemos ni
            compartimos sus datos con terceros para fines distintos.
          </p>
          <p>
            También usamos proveedores que nos dan servicios de mensajería, alojamiento y medición del sitio (por
            ejemplo, WhatsApp y Meta). Ellos tratan los datos solo por nuestra cuenta.
          </p>

          <h2>5. Sus derechos (ARCO)</h2>
          <p>
            Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su uso, así como revocar su
            consentimiento. Envíe su solicitud por WhatsApp al {SITE.telefono} o preséntela en nuestra oficina,
            indicando su nombre, el derecho que desea ejercer y una copia de su identificación. Le responderemos en
            un máximo de 20 días hábiles.
          </p>

          <h2>6. Cookies y medición</h2>
          <p>
            Este sitio usa cookies y el Píxel de Meta para medir visitas y la efectividad de nuestros anuncios. Puede
            desactivarlas desde la configuración de su navegador.
          </p>

          <h2>7. Importante</h2>
          <p>
            {SITE.brand} es un asesor independiente: no otorgamos créditos y no cobramos por la asesoría. El crédito lo
            otorga una entidad financiera y está sujeto a su aprobación. No estamos afiliados al IMSS, ISSSTE, CFE,
            Pemex ni al SNTE.
          </p>

          <h2>8. Cambios a este aviso</h2>
          <p>Publicaremos cualquier cambio en esta misma página.</p>
        </article>
      </main>
      <Footer />
    </>
  );
}
