// Clasificación determinista de lo que escribe el cliente.
//
// Por qué existe este archivo: el modelo en producción (Gemini vía
// DEEPSEEK_API_BASE) se cuelga o alucina justo en los turnos de mayor
// consecuencia (dirección, escalamiento, identificador, agendado). Cuando el
// LLM falla, el webhook manda el "Cierre B" — un mensaje de DESPEDIDA — así que
// el cliente que pregunta algo recibe "ya quedó registrada su información.
// ¡Excelente día!" una y otra vez, y su duda nunca se contesta.
//
// Regla: todo lo que tenga consecuencia real se resuelve por CÓDIGO, antes y al
// margen del LLM. Este módulo decide QUÉ está pidiendo el cliente; la ruta
// arma la respuesta. Ver skill `zernio-whatsapp` / `creditos-crm`.

/** Minúsculas sin acentos, para que "dirección" y "direccion" coincidan. */
export function normaliza(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Pregunta cuya respuesta SOLO puede dar un asesor? (BLOQUE 8 del prompt:
 * tasas, montos, requisitos, depósitos, estatus de trámite, quejas, cobranza,
 * temas legales o pedir hablar con una persona). Estas preguntas NUNCA deben
 * contestarse con información inventada ni con un mensaje de cierre: se
 * redirigen al asesor y se marca la conversación.
 */
export function esPreguntaDeAsesor(texto: string): boolean {
  const t = normaliza(texto);
  if (!t) return false;
  const patrones: RegExp[] = [
    /\btasa/, /\binteres/, /\bintereses\b/, /\bcat\b/, /\bplazo/, /\bmensualidad/,
    /\bdescuent/, /\bcomision/, /\benganche/,
    /cuanto (me )?(presta|prestan|dan|darian|sale|toca|descuentan)/,
    /cuanto es lo (maximo|minimo)/, /monto (maximo|minimo)/, /lo maximo/,
    /cuanto (me )?(pueden|podrian|podrian) (prestar|dar)/,
    /\brequisito/, /\bdocumento/, /que (necesito|piden|pide|papeles|documentos)/,
    /cuando (me )?(depositan|cae|pagan|dan el dinero)/, /cuanto tiempo (tardan|tarda)/,
    /tiempo de deposito/, /en cuanto tiempo/,
    /ya (esta|quedo|salio|avanzo) (mi|lo)/, /algun avance/, /como va mi (tramite|solicitud|credito)/,
    /estatus (de mi|del)/, /ya me (autorizaron|aprobaron|firmaron)/,
    /me van a (prestar|autorizar|aprobar)/, /(ya )?(califico|soy candidat|puedo calificar)/,
    /me (sirve|aceptan|vale) (mi|el|la) (seguro|pension|credencial|tarjeta)/,
    /(sirve|aceptan|vale|trabajan con|prestan con).{0,15}(seguro|pension|credencial|pension)/,
    /una duda/, /(mi|el) pago\b/, /(con|sobre) mi (credito|descuento|solicitud|tramite)/,
    /me descontaron/, /no me han (depositado|pagado|llamado|entregado)/,
    /reclamo/, /queja/, /cobranza/, /embargo/, /abogado/, /\blegal\b/,
    /fallec|muri/, /heredero/, /testamento/,
    /hablar con (una persona|un asesor|alguien|un humano|el encargado|un ejecutivo|un supervisor)/,
    /quiero que me (llame|marquen|hablen|llamen)/, /comunicame/, /pasame con/,
    /no (eres|sirves) (util|de ayuda)/, /nadie me (responde|contesta|atiende)/,
  ];
  return patrones.some((p) => p.test(t));
}

/**
 * ¿Pide la dirección / la ubicación de la oficina? Muy amplio a propósito: la
 * respuesta correcta ya está fija (una sola dirección oficial), así que un
 * falso positivo es inofensivo, mientras que un falso negativo deja al cliente
 * sin saber a dónde ir.
 */
export function pideUbicacion(texto: string): boolean {
  const t = normaliza(texto);
  if (!t) return false;
  if (
    /(ubicad|ubicacion|direccion|domicilio|sucursal|oficina|localiza|\bmapa\b|google maps|waze|coordenadas|en que (parte|lugar|colonia|zona|calle))/.test(
      t
    )
  ) {
    return true;
  }
  if (/(como llegar|como llego|para llegar|tengo que ir|hay que ir|donde tengo que ir|a que parte)/.test(t)) {
    return true;
  }
  if (/(a donde|adonde|donde)/.test(t)) {
    return /(ir|voy|vamos|llegar|llego|estan|esta|es|queda|encuentro|encontrar|encuentran|los|las|les|tengo|hay|la cita|asisten|atienden|reciben)/.test(
      t
    );
  }
  return false;
}

/** ¿Pregunta por SU cita ya agendada (día, hora o si sigue en pie)? */
export function preguntaPorSuCita(texto: string): boolean {
  const t = normaliza(texto);
  if (!t) return false;
  return /(mi cita|mi hora|la cita (que|quedo|qued)|que dia (me )?(quedo|tengo|es)|cuando es (mi|la) cita|a que hora (es|era|me quedo|tengo)|confirma(r)? (mi|la) cita|sigue (en pie|mi cita)|ya quedo la cita|que dia me toca)/.test(t);
}

/** ¿Confirma que quiere agendar sin decir día ni hora? ("sí, agéndeme") */
export function esAfirmacion(texto: string): boolean {
  const t = normaliza(texto);
  if (!t) return false;
  return /^(si|sii+|sip|sep|simon|claro|claro que si|por supuesto|desde luego|con gusto|va|sale|ok|okey|okay|de acuerdo|esta bien|estaria bien|perfecto|correcto|asi es|si porfa|si por favor|si gracias|si me interesa|me interesa|quiero si|de una|orale|dale)([,.;! ]|$)/.test(t);
}

/** ¿Cortesía de cierre? ("gracias", "ok, gracias") */
export function esCortesia(texto: string): boolean {
  const t = normaliza(texto);
  return /^(gracias|muchas gracias|ok gracias|ok, gracias|listo gracias|perfecto gracias|muy amable|gracias, (muy )?amable|bendiciones|igualmente)([,.;! ]|$)/.test(t);
}

/** ¿Dice que NO tiene o no trae el identificador (NSS/ficha/RFC)? */
export function noTieneIdentificador(texto: string): boolean {
  const t = normaliza(texto);
  if (!t) return false;
  return /(no (lo|la|los|las|me) (tengo|traigo|se|sabemos|recuerdo|acuerdo|encuentro|ubico)|no me (lo|la) se|no traigo|no lo tengo (a la mano|aqui|conmigo)|no lo recuerdo|no me acuerdo|no se de memoria|luego se lo (doy|mando|paso)|al rato (se lo )?(doy|mando|paso)|despues se lo (doy|mando)|no tengo ese (numero|dato)|no lo llevo|no lo traje)/.test(t);
}

/**
 * Nombre corto para saludar: un cliente se llama "José Antonio Hernández
 * Vázquez" y el bot le repetía el nombre completo en cada mensaje (robótico).
 * Se toma el primer nombre real, saltando tratamientos y partículas
 * ("Ma. de los Ángeles Ruiz" → "Ángeles").
 */
export function nombreCorto(nombre: string | null | undefined): string {
  const n = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "";
  let partes = n.split(" ");
  // Quita tratamientos y abreviaturas al inicio.
  partes = partes.filter(
    (p, i) => !(i < 2 && /^(sr\.?|sra\.?|srta\.?|don|dona|dña\.?|lic\.?|ing\.?|ma\.?|mtro\.?|c\.?)$/i.test(normaliza(p)))
  );
  // Salta partículas ("de los", "del", "la") al inicio.
  while (partes.length > 1 && /^(de|del|los|las|la|y)$/i.test(normaliza(partes[0]))) partes.shift();
  const primero = partes[0] ?? "";
  if (!primero) return "";
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

/** Tratamiento + nombre corto, para textos cálidos: "don Marco", "doña Ana". */
export function nombreTrato(nombre: string | null | undefined): string {
  const corto = nombreCorto(nombre);
  if (!corto) return "";
  return `don ${corto}`;
}
