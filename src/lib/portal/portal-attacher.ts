import { createMiddleware } from "@tanstack/react-start";
import { getPortalToken } from "./portal-token";

// Se ejecuta en el cliente antes de cada server function y agrega el header
// x-portal-token cuando hay un token guardado en localStorage. El server
// (getToken en portal.functions.ts) lo prefiere sobre la cookie.
export const attachPortalToken = createMiddleware({ type: "function" }).client(
  async ({ next, context }) => {
    const token = getPortalToken();
    if (!token) return next({ sendContext: context });
    return next({
      sendContext: context,
      headers: { "x-portal-token": token },
    });
  },
);
