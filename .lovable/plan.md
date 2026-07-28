## PASO 1 — Resultado de la auditoría

### Lo que SÍ está protegido de verdad (RLS real en Supabase)
El filtrado **por programa** sí existe a nivel de datos. Todas las tablas sensibles tienen RLS con `has_program_access()` / `has_program_role()`:
`clients`, `policies`, `incidents`, `payments`, `medical_passes`, `hospitals`, `client_programs`, `documents`, `profiles`, `sales_reps`.
Un usuario sin fila en `user_program_access` para un programa no puede leer sus datos, ni por API directa.

### Lo que NO está protegido (confirmado)

1. **Los checkboxes de módulos son 100% visuales.** La función `has_module_access()` existe en la base de datos pero **no la usa ninguna política RLS ni ninguna server function**. El único filtro está en el sidebar (`src/components/app-shell.tsx:64-72`). Un operador con solo `clients` marcado puede entrar por URL directa a `/payments`, `/incidents` o `/sales-reps` y **la API le devuelve los datos**.

2. **Ninguna ruta de `src/routes/_authenticated/` tiene `beforeLoad`.** El único gate real es "¿hay sesión?" (`route.tsx:28-36`). Integraciones se protege con un chequeo *dentro del componente* (después de renderizar); Configuración **no tiene ningún gate** — cualquier usuario abre `/settings` y ve las pestañas Alertas y Póliza y puede editarlas.

3. **Endpoints de Google Sheets sin chequeo de admin**: `getGoogleSheetsConfig`, `saveGoogleSheetsCredentials`, `setGoogleSheetsEnabled`, `testGoogleSheetsConnection`, `listSheetSyncLog`, `listSheetProblemRows` solo exigen sesión. Cualquier operador puede leer/escribir la configuración de credenciales llamando la función directamente. (Riesgo alto.)

4. **`is_super_admin()` = "tener rol `admin` en cualquier programa".** Esto es el punto crítico para tu Paso 3b: si asciendo a los 5 usuarios a `admin`, automáticamente se convierten en superadmins y verían Integraciones, todos los perfiles, credenciales y `sales_reps` globales. Hay que separar los dos conceptos.

5. **Causa real de "la operadora ve los tres programas": NO es un bug de código, es la configuración de datos.** El seed `seedZemgoUsers` (`src/lib/users.functions.ts:322-338`) le dio a casi todos los operadores fila en FUTCARE + ABC + MCV. Hoy en la base: solo `javier.moro` (FUTCARE) y `graciela.rivera` (ABC+MCV) están acotados; los demás 9 tienen los 3 programas. Necesito que me digas quién debía tener solo uno.

6. **No existe borrado de usuarios**, solo `deactivateUser` (ban) / `reactivateUser`.

7. Otros hallazgos menores: `program-context.tsx` lista **todos** los programas sin filtrar por acceso; `saveCertificatePdf` y `getMedicalPassSignedUrl` usan el cliente service-role (bypass RLS) para storage sin re-verificar programa.

**Conclusión: el filtrado por PROGRAMA es real; el filtrado por MÓDULO es solo visual. Y Configuración/Integraciones prácticamente no tienen backend gate.**

---

## PASO 2 — Corrección (estricta en backend + frontend)

### Migración A — Modelo de roles limpio
- Nueva tabla `public.platform_admins (user_id)` = **Superadministrador**. Se siembra únicamente con `admin@hope.local`.
- `is_super_admin(uuid)` se redefine para leer esa tabla (deja de significar "admin de algún programa"). Se mantiene compatibilidad con todas las políticas que ya la usan.
- Nueva función `is_program_admin(_user_id, _program_id)` y `is_any_program_admin(_user_id)` para el nivel "admin de programa" (los 5 usuarios).

### Migración B — RLS por módulo (el fix de fondo)
Se añade `has_module_access(auth.uid(), <program_id>, '<módulo>')` a las políticas SELECT/INSERT/UPDATE de:

| Tabla | Módulo requerido |
|---|---|
| `clients`, `client_programs` | `clients` |
| `policies`, `beneficiaries`, `dependents` | `policies` |
| `payments`, `payment_schedules` | `payments` |
| `incidents`, `medical_passes` | `incidents` |
| `hospitals` | `hospitals` |
| `sales_reps`, `commission_tiers` | `sales_reps` |

Los superadmins hacen bypass. Se endurece también `programs` (hoy `USING (true)`) para que cada quien solo vea sus programas, y `sales_reps` para que los admins de programa puedan leerlos (hoy es solo super-admin, lo que rompe el módulo).

Las RPC del dashboard (`get_dashboard_kpis`, `get_action_items`, `get_top_debtors`, etc.) se ajustan para filtrar por acceso del llamante en lugar de asumirlo.

### Frontend
- `beforeLoad` real en cada ruta de `_authenticated/`: valida programa + módulo contra el acceso del usuario y redirige a `/dashboard` si no aplica (`/settings` → solo superadmin y admins; `/admin/integrations/*` → solo superadmin).
- `program-context.tsx`: el selector solo muestra los programas del usuario; si el programa activo guardado en `localStorage` no está permitido, se descarta.
- Se cierran los 6 endpoints de Google Sheets con chequeo de superadmin, y se re-verifica programa en `saveCertificatePdf` / `getMedicalPassSignedUrl`.

---

## PASO 3 — Cambios de roles
- `admin@hope.local` → alta en `platform_admins`, etiqueta visible **"Superadministrador"** en Configuración > Usuarios. Único que ve Integraciones.
- `abelardo@`, `alejandro@`, `alan.gomez@`, `ing.javier@`, `saira@` (zemgo.local) → rol `admin` en FUTCARE, ABC y MCV, con `modules = NULL` (todos los módulos). Nota: hoy `saira@` tiene módulos recortados (sin `incidents` ni `hospitals`); al pasar a admin tendrá todo — dímelo si prefieres conservar su recorte.
- Se corrige el seed `seedZemgoUsers` para que no revierta estos roles al volver a ejecutarse.

## PASO 4 — Configuración
- `/settings` visible y accesible solo para superadmin + admins de programa (gate en ruta y en cada server fn: `listProgramAlertConfig`, `updateProgramAlertOffsets`, `updateProgramPolicyNumber`, `listUsers`, `getUserDetail`, `updateUserAccess`).
- La pestaña Usuarios y todo dato de credenciales queda cerrado a operators por UI, por ruta y por API.
- Integraciones desaparece del sidebar y de la ruta para los 5 admins.

## PASO 5 — Eliminar usuarios
- Nueva server fn `deleteUser`: borra `user_program_access`, `profiles` y el usuario de `auth.users` (Admin API), con protecciones: no puedes borrarte a ti mismo, no puedes borrar al último admin de un programa, no puedes borrar a un superadministrador salvo que seas superadministrador. Queda registrado en `audit_log`.
- En Configuración > Usuarios: botón Eliminar con diálogo de confirmación (escribir el email), junto a Desactivar.

---

## Antes de implementar, necesito confirmar 3 cosas

1. **¿Quién es la operadora que debía ver solo un programa, y qué programa?** Hoy 9 de 11 usuarios tienen los 3 programas en la base; corrijo las filas que me indiques.
2. **¿`saira@` conserva sus módulos recortados o pasa a admin con acceso total?** (Paso 3b dice admin en los 3 programas.)
3. Existe también `christocr9@gmail.com` con rol `admin` en los 3 programas. **¿Ese usuario debe ser Superadministrador, admin, o eliminarse?**
