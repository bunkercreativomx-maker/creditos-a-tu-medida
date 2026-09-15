import { ADDRESS, BUSINESS_NAME } from "./policy";
import type { LeadData } from "./types";

type Lang = "es" | "en";
const firstName = (lead: LeadData) => lead.nombre?.trim().split(/\s+/)[0] || "";

export function greeting(lang: Lang): string {
  return lang === "en"
    ? `Hello! Good day 👋 This is ${BUSINESS_NAME}. May I have your full name, please?`
    : `¡Hola! Buen día 👋 Le saluda ${BUSINESS_NAME}. ¿Me regala su nombre completo, por favor?`;
}

export function nextQuestion(lead: LeadData, lang: Lang): string | null {
  const name = firstName(lead);
  if (!lead.nombre) return greeting(lang);
  if (!lead.estatus) return lang === "en"
    ? `Nice to meet you, ${name}. Are you retired or receiving a pension?`
    : `Mucho gusto, ${name}. ¿Usted es jubilado o pensionado?`;
  if (!lead.dependencia) return lang === "en"
    ? "Which institution provides your pension: IMSS, ISSSTE, CFE, SNTE, or PEMEX?"
    : "¿De qué dependencia recibe su pensión: IMSS, ISSSTE, CFE, SNTE o PEMEX?";
  if (!lead.monto_solicitado) return lang === "en"
    ? "How much would you like to request?"
    : "¿De cuánto es el préstamo que está solicitando?";
  if (!lead.credito_vigente) return lang === "en"
    ? "Do you currently have a loan with another company serving retirees and pensioners?"
    : "¿Actualmente tiene algún préstamo vigente con otra empresa de préstamos para jubilados y pensionados?";
  if (lead.credito_vigente === "si" && !lead.empresa_credito) return lang === "en"
    ? "Which company is it with?"
    : "¿Con qué empresa lo tiene?";
  if (lead.credito_vigente === "si" && !lead.antiguedad_credito) return lang === "en"
    ? "When did you take out that loan?"
    : "¿Hace cuánto tiempo sacó ese préstamo?";
  return null;
}

export const addressOnly = () => ADDRESS;

export function advisor(lang: Lang): string {
  return lang === "en"
    ? "Of course. A member of our team will provide that information accurately. I’ll connect you now."
    : "Con gusto, esa información se la da directamente un asesor para que sea exacta. Permítame comunicarlo; en un momento le responden por aquí.";
}

export function sensitive(lang: Lang): string {
  return lang === "en"
    ? "Thank you, but for your security, that information is reviewed directly with the advisor during the appointment."
    : "Gracias, pero por seguridad esos datos se revisan directamente en la cita con el asesor.";
}

export function notEligible(lead: LeadData, lang: Lang): string {
  const name = firstName(lead);
  return lang === "en"
    ? `${name ? `${name}, ` : ""}our service is exclusively for IMSS, ISSSTE, CFE, SNTE, or PEMEX retirees and pensioners. We pay $500 MXN for each referral that is approved and receives their loan.`
    : `${name ? `${name}, ` : ""}nuestro servicio es exclusivo para jubilados y pensionados de IMSS, ISSSTE, CFE, SNTE o PEMEX. Damos $500 MXN por cada referencia que sea autorizada y reciba su préstamo.`;
}

export function askDay(lang: Lang): string {
  return lang === "en"
    ? "Thank you. We can now schedule an appointment with an advisor. What day works best for you?"
    : "Gracias. Ya podemos agendarle una cita con un asesor. ¿Qué día le queda mejor?";
}

export function offerTimes(times: string[], lang: Lang): string {
  if (times.length === 0) return lang === "en"
    ? "There are no available times that day. What other day works for you?"
    : "Ese día ya no tiene horarios disponibles. ¿Qué otro día le queda mejor?";
  const joined = times.join(lang === "en" ? " or " : " o ");
  return lang === "en" ? `I can offer ${joined}. Which do you prefer?` : `Le puedo ofrecer ${joined}. ¿Cuál prefiere?`;
}

export function confirmProposal(date: string, time: string, lang: Lang): string {
  return lang === "en"
    ? `${date} at ${time} is available. Would you like me to confirm it?`
    : `El ${date} a las ${time} está disponible. ¿Desea que se la confirme?`;
}

export function occupied(times: string[], lang: Lang): string {
  if (!times.length) return offerTimes([], lang);
  const joined = times.join(lang === "en" ? " or " : " o ");
  return lang === "en"
    ? `That time is no longer available. I can offer ${joined}.`
    : `A esa hora ya está apartado. Le puedo ofrecer ${joined}.`;
}

export function sundayAdvisor(lang: Lang): string {
  return lang === "en"
    ? "Sunday appointments are coordinated directly by our team. I’ll connect you with a representative."
    : "Las citas del domingo las coordina directamente nuestro equipo. Permítame comunicarlo con un asesor.";
}

export function confirmed(lead: LeadData, label: string, lang: Lang): string[] {
  const name = firstName(lead);
  if (lang === "en") return [
    `All set, ${name}. Your appointment is confirmed for ${label}. Address: ${ADDRESS}. An advisor will be expecting you.`,
    "Your information has been registered and shared with the team. Thank you for your trust. 🙏",
  ];
  return [
    `¡Listo, ${name}! Su cita queda confirmada para el ${label}. 📍 ${ADDRESS}. Un asesor lo estará esperando.`,
    "Ya registré su información y se la pasé al equipo. Muchas gracias por su confianza. 🙏",
  ];
}

export function appointmentInfo(label: string, lang: Lang): string {
  return lang === "en" ? `Your appointment is scheduled for ${label}. Address: ${ADDRESS}.` : `Su cita está agendada para el ${label}. 📍 ${ADDRESS}.`;
}

