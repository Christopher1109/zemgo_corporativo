// Centroides aproximados de los 32 estados de México (lng, lat).
// Usado para colocar pines en el mapa MapLibre.
export const MX_STATES: Record<string, { name: string; lng: number; lat: number; aliases: string[] }> = {
  AGS: { name: "Aguascalientes", lng: -102.296, lat: 21.885, aliases: ["aguascalientes", "ags"] },
  BC:  { name: "Baja California", lng: -115.350, lat: 30.840, aliases: ["baja california", "b.c.", "bc"] },
  BCS: { name: "Baja California Sur", lng: -111.666, lat: 25.000, aliases: ["baja california sur", "b.c.s.", "bcs"] },
  CAM: { name: "Campeche", lng: -90.535, lat: 18.836, aliases: ["campeche", "cam", "camp"] },
  CHP: { name: "Chiapas", lng: -92.638, lat: 16.756, aliases: ["chiapas", "chis", "chp"] },
  CHH: { name: "Chihuahua", lng: -106.073, lat: 28.633, aliases: ["chihuahua", "chih", "chh"] },
  CMX: { name: "Ciudad de México", lng: -99.133, lat: 19.432, aliases: ["ciudad de méxico", "cdmx", "cmx", "df", "distrito federal", "mexico city"] },
  COA: { name: "Coahuila", lng: -101.713, lat: 27.058, aliases: ["coahuila", "coah", "coa"] },
  COL: { name: "Colima", lng: -103.724, lat: 19.245, aliases: ["colima", "col"] },
  DUR: { name: "Durango", lng: -104.658, lat: 24.628, aliases: ["durango", "dgo", "dur"] },
  GTO: { name: "Guanajuato", lng: -101.090, lat: 20.917, aliases: ["guanajuato", "gto"] },
  GRO: { name: "Guerrero", lng: -100.072, lat: 17.439, aliases: ["guerrero", "gro"] },
  HID: { name: "Hidalgo", lng: -98.762, lat: 20.500, aliases: ["hidalgo", "hgo", "hid"] },
  JAL: { name: "Jalisco", lng: -103.681, lat: 20.659, aliases: ["jalisco", "jal"] },
  MEX: { name: "Estado de México", lng: -99.715, lat: 19.357, aliases: ["estado de méxico", "edomex", "mex", "méxico"] },
  MIC: { name: "Michoacán", lng: -101.706, lat: 19.566, aliases: ["michoacán", "michoacan", "mich", "mic"] },
  MOR: { name: "Morelos", lng: -98.882, lat: 18.681, aliases: ["morelos", "mor"] },
  NAY: { name: "Nayarit", lng: -104.894, lat: 21.751, aliases: ["nayarit", "nay"] },
  NL:  { name: "Nuevo León", lng: -99.996, lat: 25.592, aliases: ["nuevo león", "nuevo leon", "n.l.", "nl"] },
  OAX: { name: "Oaxaca", lng: -96.726, lat: 17.073, aliases: ["oaxaca", "oax"] },
  PUE: { name: "Puebla", lng: -97.892, lat: 19.041, aliases: ["puebla", "pue"] },
  QRO: { name: "Querétaro", lng: -100.388, lat: 20.589, aliases: ["querétaro", "queretaro", "qro"] },
  ROO: { name: "Quintana Roo", lng: -88.299, lat: 19.181, aliases: ["quintana roo", "q. roo", "qroo", "roo"] },
  SLP: { name: "San Luis Potosí", lng: -100.978, lat: 22.156, aliases: ["san luis potosí", "san luis potosi", "slp"] },
  SIN: { name: "Sinaloa", lng: -107.385, lat: 25.171, aliases: ["sinaloa", "sin"] },
  SON: { name: "Sonora", lng: -110.331, lat: 29.298, aliases: ["sonora", "son"] },
  TAB: { name: "Tabasco", lng: -92.928, lat: 18.000, aliases: ["tabasco", "tab"] },
  TAM: { name: "Tamaulipas", lng: -98.836, lat: 24.266, aliases: ["tamaulipas", "tam", "tamps"] },
  TLA: { name: "Tlaxcala", lng: -98.237, lat: 19.318, aliases: ["tlaxcala", "tlax", "tla"] },
  VER: { name: "Veracruz", lng: -96.134, lat: 19.173, aliases: ["veracruz", "ver"] },
  YUC: { name: "Yucatán", lng: -88.937, lat: 20.710, aliases: ["yucatán", "yucatan", "yuc"] },
  ZAC: { name: "Zacatecas", lng: -102.583, lat: 23.000, aliases: ["zacatecas", "zac"] },
};

export function matchState(raw: string | null | undefined): { code: string; name: string; lng: number; lat: number } | null {
  if (!raw) return null;
  const norm = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  for (const [code, s] of Object.entries(MX_STATES)) {
    if (code.toLowerCase() === norm) return { code, ...s };
    if (s.aliases.some(a => a.normalize("NFD").replace(/[\u0300-\u036f]/g,"") === norm)) return { code, ...s };
  }
  return null;
}
