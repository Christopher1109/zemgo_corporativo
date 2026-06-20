
# Portal del Cliente

Construcción del área de autoservicio en `/portal`, separada visualmente del CRM, con autenticación propia por CURP + código de 6 dígitos (sin usar `auth.users` de Supabase).

## Alcance (en este entregable)

- Rutas, layout mobile-first y theming por programa
- Auth por CURP + nombre → OTP de 6 dígitos (banner amarillo "MODO QA")
- Sesión de 24h con cookie httpOnly
- Dashboard, Pólizas, Pagos, Siniestros, Mi perfil, Logout
- Reporte de siniestro y modificación de perfil desde el portal
- Descarga de certificado (reusa generador React-PDF actual)
- Generación de referencia bancaria (reusa RPC existente)
- Stubs preparados para WhatsApp y Google Sheets
- Migración con tablas, RLS y RPCs `SECURITY DEFINER`

## Fuera de alcance (explícitamente diferido)

- Envío real WhatsApp / lectura real Sheets / pago con tarjeta Banorte
- Recuperación de cuenta sin CURP
- Multi-idioma

## Arquitectura técnica

### Rutas (`src/routes/portal/*`)
- `portal.tsx` — layout propio (sin app-shell del CRM), maneja redirect si hay sesión
- `portal.index.tsx` — landing + formulario CURP/Nombre
- `portal.verify.tsx` — OTP 6 inputs, contador reenviar, banner QA
- `portal._app.tsx` — layout protegido (valida cookie vía server fn), nav inferior mobile / tabs desktop
- `portal._app.dashboard.tsx`
- `portal._app.policies.tsx`
- `portal._app.payments.tsx`
- `portal._app.incidents.tsx`
- `portal._app.incidents.new.tsx`
- `portal._app.profile.tsx`
- `portal._app.logout.tsx`

Todas con `ssr: false` (el portal vive en cliente, igual que `_authenticated`).

### Auth model
- No usa `auth.uid()`. Cookie httpOnly `portal_token` (token aleatorio 256-bit, `token_hash` SHA-256 guardado en DB).
- Server functions del portal (NO `requireSupabaseAuth`) leen la cookie con `getRequestHeader('cookie')`, validan token contra `portal_sessions` usando `supabaseAdmin` (cargado dinámico dentro del handler), resuelven `client_id` y filtran TODAS las queries por ese `client_id`.
- Las RPCs `SECURITY DEFINER` reciben el token, resuelven `client_id` internamente y solo operan sobre datos de ese cliente — defensa en profundidad.

### Tablas nuevas (migración)
- `portal_access_codes` (id, client_id FK, code_hash, expires_at, used_at, attempts, ip_address, created_at)
- `portal_sessions` (id, client_id FK, token_hash UNIQUE, expires_at, revoked_at, ip_address, user_agent, created_at)
- `sheet_sync_log` (id, sheet_id, started_at, ended_at, rows_detected, rows_imported, rows_skipped, status, error)
- Índices en `code_hash`, `token_hash`, `expires_at`, `client_id`
- GRANTs solo a `service_role` (acceso únicamente por RPC `SECURITY DEFINER`) + RLS habilitado con policy `USING (false)` para `anon`/`authenticated`
- Llaves nuevas en `system_config` para WhatsApp y Google Sheets (insert idempotente)

### RPCs nuevas (en migración, `SECURITY DEFINER`)
- `request_portal_access(_curp, _full_name)` — valida cliente, normaliza nombre (lower + unaccent), genera código, hashea (usa `crypt()` con bcrypt vía `pgcrypto`), invalida códigos previos, devuelve `{client_id, dev_code}` (el `dev_code` solo se devuelve si `system_config.portal.qa_mode = true`; en prod no se expone)
- `verify_portal_code(_client_id, _code, _ip, _ua)` — verifica bcrypt, rate-limit 5 intentos / 15 min, crea sesión, devuelve token plano (único momento)
- `resolve_portal_session(_token)` — devuelve client_id si válido
- `get_portal_dashboard(_token)`, `get_portal_policies(_token)`, `get_portal_payments(_token)`, `get_portal_incidents(_token)`
- `report_portal_incident(_token, _payload)` — reusa lógica de `report_incident` marcando `metadata.reported_from='portal'`
- `update_portal_profile(_token, _changes)` — whitelist: phone, email, address; audit `CLIENT_SELF_UPDATED`
- `revoke_portal_session(_token)`

### Server functions (`src/lib/portal/*.functions.ts`)
- `requestPortalAccess`, `verifyPortalCode` — devuelven datos + setean cookie (`setResponseHeader('set-cookie', ...)`)
- `portalMe`, `portalDashboard`, `portalPolicies`, `portalPayments`, `portalIncidents`, `portalReportIncident`, `portalUpdateProfile`, `portalLogout`, `portalGenerateBankReference`, `portalCertificatePayload`
- Helper `getPortalClientId()` lee cookie y llama `resolve_portal_session`; throw 401 si inválido

### Stubs preparados
- `src/lib/whatsapp.ts` — interface `WhatsAppSender`, impl `StubSender` que `console.log` + inserta en `notifications` (channel='whatsapp')
- `src/lib/google-sheets.ts` — interface `SheetsReader`, impl stub devuelve `[]`
- `src/lib/sheets-sync.functions.ts` — server fn que loguea stub y escribe en `sheet_sync_log`

### Theming
- Layout del portal usa `ProgramThemeProvider` con el programa de la primera póliza activa (o ABC por defecto)
- Sin sidebar CRM. Header simple con logo HOPE + estado de sesión. Bottom nav en mobile (tabs).

## Verificación

1. Migración aplicada, tablas creadas con RLS
2. Seed: usar un cliente existente con CURP del seed (lo identifico tras la migración)
3. Flujo manual: `/portal` → ingresar CURP+nombre → ver banner amarillo con código → `/portal/verify` → ingresar → dashboard
4. Verificar aislamiento: intentar acceder a `/portal/policies` con cookie inválida → redirect
5. Verificar que reportar siniestro desde portal aparezca en `/incidents` del CRM con flag

## Entregables al terminar

1. URL del portal (`/portal`) y CURP de un cliente seed para probar
2. Lista de RPCs creadas
3. Confirmación de que el banner QA muestra el código
4. Checklist con resultados

¿Procedo con la implementación?
