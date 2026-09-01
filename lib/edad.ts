// Cálculo de edad a partir de una fecha de nacimiento (YYYY-MM-DD).
// Devuelve null si la fecha no es válida.

export function calcularEdad(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return null;
  const nacimiento = new Date(y, m - 1, d);
  if (isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mesActual = hoy.getMonth() - nacimiento.getMonth();
  if (mesActual < 0 || (mesActual === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }
  return edad >= 0 ? edad : null;
}
