/** Fecha local de hoy en formato YYYY-MM-DD (no UTC). */
export const localTodayIso = () => new Date().toLocaleDateString("en-CA");

/**
 * Convierte la fecha elegida en el formulario (YYYY-MM-DD) a timestamp ISO para `paid_at`.
 * Si es hoy, usa la hora actual (mediodía podría quedar "en el futuro" y la BD lo rechaza
 * con paid_at_cannot_be_future). Para días anteriores usa mediodía local para no cambiar de día.
 */
export function paidAtToIso(date: string): string {
  if (date === localTodayIso()) return new Date().toISOString();
  return new Date(`${date}T12:00:00`).toISOString();
}
