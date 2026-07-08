# Plan — ZEMGO parte 2 (4 bloques)

## 1. Carta Aviso de Accidente (HIR) — rehacer con React-PDF nativo
Ya existe `MedicalPassHIR.tsx` (React-PDF) muy cercana al diseño de referencia. El generador actual (`accident-notice.functions.ts`) usa la imagen de plantilla + pdf-lib con posiciones absolutas — frágil. Voy a:

- Reescribir `portalAccidentNotice` para usar `MedicalPassHIR` (React-PDF) vía `renderPdfToBytes`.
- Ajustar la plantilla al diseño exacto (encabezado naranja/azul con círculos, campos con fondo gris claro tipo píldora, franja naranja del aviso 48hrs, footer azul con contactos, firma de Graciela Rivera Bersoza).
- Autocompletar: contratante, N° póliza (desde configuración por programa — punto 3), asegurado, fecha nac., CURP, N° certificado, suma asegurada.
- Captura manual (ya se pide al reportar): deducible, fecha/hora accidente, descripción, hospital.
- Firma "Graciela Rivera Bersoza" con imagen SVG/asset de firma (se conserva la actual del director si está cargada; nombre fijo por defecto).
- Eliminar dependencia de la imagen de fondo `accident-notice-hir-bg.jpg`.

## 2. Contratante como entidad + validaciones
- Nueva tabla `contractors` (mismos campos que `clients`: full_name, curp, phone, email, address...).
- Columna `contractor_id` en `policies` (FK a contractors). Deprecar el campo texto `contracting_party` (mantener por compatibilidad, poblar desde el contractor).
- En `/policies/new`:
  - Buscador de "Cliente titular" (ya existe).
  - Checkbox "El contratante es el mismo que el cliente titular" (default ON).
  - Si OFF: buscador de Contratante + botón "Crear nuevo contratante" inline (modal corto).
  - Botón "Crear nuevo cliente titular" inline también (si no existe ya).
- Validaciones al crear contractor:
  - Bloqueo si tel/email == usuario en sesión → error.
  - Advertencia si tel/email ya existe en otro contractor → dialog "Confirmar / Corregir".
- Los datos de contacto viven en `contractors`. `clients` conserva sus campos pero no se validan contra sesión.

## 3. N° Póliza por programa en Configuración
- Añadir columna `policy_number` a `programs` (ya existe? verificar — si no, migración).
- Nueva pestaña "Póliza" en `/settings` con lista de los 3 programas (ABC, FUT-CARE, MCV) y campo editable por cada uno.
- Server fn `updateProgramPolicyNumber` (super-admin).
- La Carta Aviso usa `programs.policy_number` según el programa del certificado.

## 4. Filtros en /hospitals
- Añadir en la vista de Hospitales tres controles combinables:
  - Input de búsqueda por nombre (contains, case-insensitive).
  - Select por ciudad (poblado con ciudades distintas de la lista).
  - Select por estatus: Todos / Activo / Inactivo.
- Filtrado client-side sobre el listado ya cargado.

## Orden de ejecución
1. Migración: `contractors` + `policies.contractor_id` + `programs.policy_number` (si falta).
2. Punto 3 (Configuración Póliza) — rápido, desbloquea punto 1.
3. Punto 1 (Carta HIR reescrita) — con captura de verificación.
4. Punto 2 (Contratante entidad + validaciones).
5. Punto 4 (Filtros Hospitales).

Confirmación con screenshot al terminar cada bloque, en particular el 1.
