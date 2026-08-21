"use client";

import { useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BANCOS,
  ESTADOS_CIVILES,
  GENEROS,
  MONTOS_APROXIMADOS,
  TIPOS_CREDITO_OPCIONES,
} from "@/lib/site-content";

type Status = "idle" | "sending" | "sent" | "error";
type DocKey = "ine_frente" | "ine_reverso" | "comprobante_domicilio";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { label: "Personal", icon: "person" as const },
  { label: "Financiero", icon: "card" as const },
  { label: "Documentos", icon: "document" as const },
];

const DOC_FIELDS: { docKey: DocKey; label: string; helper: string }[] = [
  {
    docKey: "ine_frente",
    label: "Foto INE (frente)",
    helper: "Coloca tu INE sobre superficie plana, asegúrate que se vea completo y nítido (Máx 25MB)",
  },
  {
    docKey: "ine_reverso",
    label: "Foto INE (reverso)",
    helper: "Voltea tu INE y toma la foto del reverso en superficie plana (Máx 25MB)",
  },
  {
    docKey: "comprobante_domicilio",
    label: "Comprobante de domicilio",
    helper: "El documento debe ser reciente (máx. 3 meses) y mostrar tu nombre y dirección (Máx 25MB)",
  },
];

const REQUIRED_PERSONAL = ["nombre", "apellido", "telefono", "fecha_nacimiento", "lugar_nacimiento", "genero", "estado_civil"];
const REQUIRED_FINANCIERO = ["curp", "rfc", "nss", "institucion", "tipo_credito", "monto_aproximado", "banco", "clabe"];

export function ContactForm() {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Partial<Record<DocKey, File>>>({});

  function setField(name: string, value: string) {
    setData((prev) => ({ ...prev, [name]: value }));
  }

  function handleFile(key: DocKey, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setFiles((prev) => ({ ...prev, [key]: file }));
  }

  function canAdvance(required: string[]) {
    return required.every((key) => (data[key] ?? "").trim() !== "");
  }

  async function handleSubmit() {
    setStatus("sending");
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => form.append(key, value));
    Object.entries(files).forEach(([key, file]) => file && form.append(key, file));

    try {
      const res = await fetch("/api/leads", { method: "POST", body: form });
      if (!res.ok) throw new Error("request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="rounded-3xl border border-gold-300 bg-gold-100 p-10 text-center shadow-sm"
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-500 text-navy-950">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="mt-4 font-display text-xl font-semibold text-navy-900">¡Solicitud recibida!</h3>
        <p className="mt-2 text-ink-600">Un asesor te contactará en menos de 24 horas.</p>
      </motion.div>
    );
  }

  return (
    <div className="rounded-3xl border border-navy-900/8 bg-white p-6 shadow-[0_1px_2px_rgba(10,22,40,0.04)] sm:p-9">
      <h3 className="text-center font-display text-2xl font-semibold text-navy-900">Solicita tu crédito ahora</h3>
      <p className="mt-1 text-center text-sm text-ink-600">Un asesor te contactará en menos de 24 horas</p>

      <Stepper current={step} />

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease }}
            className="mt-8 grid gap-4 sm:grid-cols-2"
          >
            <Field label="Nombre(s)" name="nombre" value={data.nombre} onChange={setField} required />
            <Field label="Apellido(s)" name="apellido" value={data.apellido} onChange={setField} required />
            <Field
              label="Teléfono / WhatsApp"
              name="telefono"
              type="tel"
              placeholder="Tu número a 10 dígitos"
              value={data.telefono}
              onChange={setField}
              required
            />
            <Field
              label="Correo Electrónico (Opcional)"
              name="email"
              type="email"
              placeholder="tucorreo@ejemplo.com"
              value={data.email}
              onChange={setField}
            />
            <Field
              label="Fecha de Nacimiento"
              name="fecha_nacimiento"
              type="date"
              value={data.fecha_nacimiento}
              onChange={setField}
              required
            />
            <Field
              label="Lugar de Nacimiento"
              name="lugar_nacimiento"
              placeholder="Estado o ciudad"
              value={data.lugar_nacimiento}
              onChange={setField}
              required
            />
            <SelectField label="Género" name="genero" value={data.genero} onChange={setField} options={GENEROS} required />
            <SelectField
              label="Estado Civil"
              name="estado_civil"
              value={data.estado_civil}
              onChange={setField}
              options={ESTADOS_CIVILES}
              required
            />
            <div className="sm:col-span-2">
              <NavButtons onNext={() => setStep(2)} nextDisabled={!canAdvance(REQUIRED_PERSONAL)} />
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease }}
            className="mt-8 grid gap-4 sm:grid-cols-2"
          >
            <Field label="CURP" name="curp" value={data.curp} onChange={setField} required />
            <Field label="RFC" name="rfc" value={data.rfc} onChange={setField} required />
            <Field label="Número de Pensión / NSS" name="nss" value={data.nss} onChange={setField} required />
            <Field
              label="Institución"
              name="institucion"
              placeholder="¿Con qué institución recibes tu pago?"
              value={data.institucion}
              onChange={setField}
              required
            />
            <SelectField
              label="Tipo de Crédito"
              name="tipo_credito"
              value={data.tipo_credito}
              onChange={setField}
              options={TIPOS_CREDITO_OPCIONES}
              placeholder="Selecciona el tipo"
              required
            />
            <SelectField
              label="Monto Aproximado"
              name="monto_aproximado"
              value={data.monto_aproximado}
              onChange={setField}
              options={MONTOS_APROXIMADOS.map((m) => ({ value: m, label: m }))}
              placeholder="¿Cuánto necesitas?"
              required
            />
            <SelectField
              label="Banco"
              name="banco"
              value={data.banco}
              onChange={setField}
              options={BANCOS.map((b) => ({ value: b, label: b }))}
              required
            />
            <Field
              label="CLABE Interbancaria"
              name="clabe"
              placeholder="18 dígitos"
              maxLength={18}
              value={data.clabe}
              onChange={setField}
              required
            />
            <div className="sm:col-span-2">
              <NavButtons
                onPrev={() => setStep(1)}
                onNext={() => setStep(3)}
                nextDisabled={!canAdvance(REQUIRED_FINANCIERO)}
              />
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease }}
            className="mt-8 space-y-5"
          >
            {DOC_FIELDS.map((doc) => (
              <DocUpload
                key={doc.docKey}
                label={doc.label}
                helper={doc.helper}
                file={files[doc.docKey]}
                onChange={(e) => handleFile(doc.docKey, e)}
              />
            ))}
            {status === "error" && (
              <p className="text-sm text-red-600">
                Hubo un problema al enviar tu solicitud. Intenta de nuevo o escríbenos por WhatsApp.
              </p>
            )}
            <NavButtons
              onPrev={() => setStep(2)}
              onSubmit={handleSubmit}
              submitLabel={status === "sending" ? "Enviando..." : "Enviar mi solicitud"}
              submitDisabled={status === "sending"}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mt-7 flex items-center justify-center gap-3">
      {STEPS.map((s, i) => {
        const num = i + 1;
        const active = num <= current;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{ scale: num === current ? 1.08 : 1 }}
                transition={{ duration: 0.3, ease }}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-300 ${
                  active ? "bg-gold-500 text-navy-950 shadow-[0_4px_16px_-2px_rgba(201,162,39,0.5)]" : "bg-navy-900/8 text-navy-900/30"
                }`}
              >
                <StepIcon icon={s.icon} />
              </motion.div>
              <span className={`text-xs font-medium ${active ? "text-navy-900" : "text-navy-900/30"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 rounded-full transition-colors duration-500 sm:w-14 ${num < current ? "bg-gold-500" : "bg-navy-900/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepIcon({ icon }: { icon: "person" | "card" | "document" }) {
  if (icon === "person") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
        <path d="M5 20c1.2-3.8 4-5.5 7-5.5s5.8 1.7 7 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "card") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  maxLength,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  value?: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full rounded-xl border border-navy-900/12 bg-cream-50 px-3.5 py-2.5 text-sm text-navy-900 outline-none transition-all focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-500/15"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  required,
  placeholder = "Selecciona...",
}: {
  label: string;
  name: string;
  value?: string;
  onChange: (name: string, value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>
      <select
        name={name}
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full rounded-xl border border-navy-900/12 bg-cream-50 px-3.5 py-2.5 text-sm text-navy-900 outline-none transition-all focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-500/15"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DocUpload({
  label,
  helper,
  file,
  onChange,
}: {
  label: string;
  helper: string;
  file?: File;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = `doc-${label}`;
  return (
    <label htmlFor={id} className="block cursor-pointer">
      <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all duration-300 ${
          file ? "border-gold-400 bg-gold-100" : "border-navy-900/12 bg-cream-50 hover:border-gold-400 hover:bg-gold-100/40"
        }`}
      >
        {file ? (
          <>
            <span className="text-gold-600">✓</span>
            <span className="mt-1 text-sm font-medium text-navy-900">{file.name}</span>
          </>
        ) : (
          <>
            <CameraIcon />
            <span className="mt-2 text-sm text-ink-600">Toca para tomar foto</span>
          </>
        )}
      </div>
      <input id={id} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
      <p className="mt-1.5 text-xs text-ink-600">{helper}</p>
    </label>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-navy-900/30">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function NavButtons({
  onPrev,
  onNext,
  onSubmit,
  nextDisabled,
  submitDisabled,
  submitLabel,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  nextDisabled?: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-navy-900/8 pt-5">
      {onPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="rounded-full border border-navy-900/15 px-5 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-cream-100"
        >
          ← Anterior
        </button>
      ) : (
        <span />
      )}
      {onSubmit ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-navy-950 shadow-[0_4px_16px_-2px_rgba(201,162,39,0.4)] transition-all hover:bg-gold-400 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-full bg-navy-900 px-6 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-navy-800 disabled:opacity-40"
        >
          Siguiente →
        </button>
      )}
    </div>
  );
}
