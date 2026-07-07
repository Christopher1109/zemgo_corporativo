// Helpers para persistir el token de sesión del portal en el navegador y
// exponerlo como header en las llamadas a los server functions del portal.
// Necesario porque en el preview la app corre dentro de un iframe cross-site
// y las cookies httpOnly SameSite=None son descartadas por el navegador.

const KEY = "portal_token";

export function getPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPortalToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {}
}

export function clearPortalToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
