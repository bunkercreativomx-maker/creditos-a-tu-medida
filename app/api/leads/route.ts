import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLead } from "@/lib/push";
import type { LeadOrigen, TipoCredito, Genero, EstadoCivil } from "@/lib/types";

const DOCUMENT_FIELDS = [
  { field: "ine_frente", column: "ine_frente" as const },
  { field: "ine_reverso", column: "ine_reverso" as const },
  { field: "comprobante_domicilio", column: "comprobante_domicilio" as const },
] as const;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB (igual que el límite client-side)
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Content-Type debe ser multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const telefono = str(form.get("telefono"));
  if (!telefono || telefono.length < 10) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }

  const pb = await createAdminClient();

  const insertPayload: Record<string, unknown> = {
    telefono,
    origen: "web_form" as LeadOrigen,
    nombre: str(form.get("nombre")),
    apellido: str(form.get("apellido")),
    email: str(form.get("email")),
    fecha_nacimiento: str(form.get("fecha_nacimiento")),
    lugar_nacimiento: str(form.get("lugar_nacimiento")),
    genero: (str(form.get("genero")) as Genero) ?? null,
    estado_civil: (str(form.get("estado_civil")) as EstadoCivil) ?? null,
    curp: str(form.get("curp")),
    rfc: str(form.get("rfc")),
    nss: str(form.get("nss")),
    institucion: str(form.get("institucion")),
    tipo_credito: (str(form.get("tipo_credito")) as TipoCredito) ?? null,
    monto_aproximado: str(form.get("monto_aproximado")),
    banco: str(form.get("banco")),
    clabe: str(form.get("clabe")),
    status: "nuevo",
  };

  let lead: { id: string } | null = null;
  try {
    const created = await pb.collection("leads").create(insertPayload);
    lead = { id: created.id };
  } catch (err) {
    console.error("Error creando lead desde formulario web:", err);
    return NextResponse.json({ error: "No se pudo registrar la solicitud" }, { status: 500 });
  }

  // Validar y subir documentos
  const fileUpdates: Record<string, File> = {};
  for (const { field, column } of DOCUMENT_FIELDS) {
    const file = form.get(field);
    if (!(file instanceof File) || file.size === 0) continue;

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `El archivo ${field} supera los 25 MB` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido en ${field}` },
        { status: 400 }
      );
    }
    fileUpdates[column] = file;
  }

  if (Object.keys(fileUpdates).length > 0) {
    try {
      await pb.collection("leads").update(lead.id, fileUpdates);
    } catch (err) {
      console.error(`Error subiendo documentos del lead ${lead.id}:`, err);
      // El lead ya se creó; reportar pero no romper el flujo
    }
  }

  // Notificar a los asesores por push (fire-and-forget)
  notifyNewLead({
    nombre: insertPayload.nombre as string | null,
    apellido: insertPayload.apellido as string | null,
    monto_aproximado: insertPayload.monto_aproximado as string | null,
  });

  return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201 });
}
