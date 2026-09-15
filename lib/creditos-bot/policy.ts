export const BUSINESS_NAME = "Créditos a tu medida";
export const TIME_ZONE = "America/Ciudad_Juarez";
export const ADDRESS =
  "Benjamín Franklin 3220, Local 22D, Plaza de las Américas, Zona Pronaf, C.P. 32315, Cd. Juárez, Chihuahua";

export const ELIGIBLE_DEPENDENCIES = ["IMSS", "ISSSTE", "CFE", "SNTE", "PEMEX"] as const;

// Citas de 30 minutos, con un inicio cada hora según la decisión del negocio.
export const APPOINTMENT_DURATION_MINUTES = 30;
export const WEEKDAY_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00"] as const;
export const SATURDAY_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00"] as const;
export const SUNDAY_SLOTS: readonly string[] = [];

export function slotsForLocalDate(localDate: string): readonly string[] {
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  if (day === 0) return SUNDAY_SLOTS;
  if (day === 6) return SATURDAY_SLOTS;
  return WEEKDAY_SLOTS;
}

export function isEligibleDependency(value: string | null | undefined): boolean {
  return ELIGIBLE_DEPENDENCIES.includes(value as (typeof ELIGIBLE_DEPENDENCIES)[number]);
}

