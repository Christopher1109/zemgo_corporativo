Cinco bloques de trabajo. Antes de arrancar, quiero confirmar el plan y algunas decisiones.

## 1) Certificados PDF (ABC, FUT-CARE, MCV) — refactor de maquetación

Los templates React-PDF ya existen (`CertificateABC.tsx`, `CertificateFutCare.tsx`, `CertificateMCV.tsx`) pero:
- Usan placeholders (círculo con corazón dibujado, SVG improvisado de "manos", texto "FUT-CARE" tipográfico) en lugar de los logos reales.
- Los colores no coinciden con la paleta de marca de los PDFs modelo.
- El pie de página y algunas franjas están apagadas / con contraste bajo.

Acciones:
- **Subir los 3 logos** provistos como CDN assets (`program-abc.png`, `program-futcare.png`, `program-mcv.png`) mediante `lovable-assets`. Reemplazar en cada template el placeholder por `<Image src=... />` con la URL del asset.
- **Actualizar `PDF_THEME.programs`** con los tonos exactos:
  - ABC: `#6DBE45` (verde marca), texto blanco en franjas y pie.
  - FUT-CARE: `#14284E` (azul marino), texto blanco.
  - MCV: `#A85670` (vino/rosa), texto blanco.
- **Parametrizar** un componente único `CertificateTemplate` que recibe `{ program: { code, brandColor, logoUrl, insurerFooterName, showRamo, coverages, footerNote? } }` y renderiza la misma estructura para los 3. Los 3 templates actuales pasan a ser thin wrappers que sólo pasan sus parámetros. Esto cumple el requisito de "parametrizado por programa, no hardcodeado".
- **Coberturas**: mantener el arreglo por programa como hasta ahora (hardcodeado por contrato), pero recibirlo como prop del wrapper para permitir cambios futuros sin tocar el layout.
- **Pie de página**: convertir el link a `<Link src="https://www.zemgoseguros.com.mx/">` (react-pdf soporta hipervínculo real).
- MCV: mantener sin fila "Ramo del seguro" (ya está así). Confirmar que el pie SÍ incluye "Programa administrado, operado y respaldado por: ZEMGO" (actualmente lo omite — los otros dos sí lo tienen). Voy a añadirlo salvo indicación contraria.
- QA: renderizar un PDF de prueba para cada programa con datos de muestra vía la ruta smoke (`/api/public/pdf-smoke`), convertir a JPG con `pdftoppm` y adjuntar capturas.

## 2) Portal del asegurado — dashboard más completo

Ya existe hero + tarjeta principal + próximo pago + reportar siniestro. Voy a **añadir**, usando lo que ya devuelve `portalDashboard` (o extendiéndolo si falta):
- Grid de KPIs arriba: días restantes de vigencia, suma asegurada total, próximo vencimiento, estatus general.
- Tarjeta "Coberturas contratadas" con lista de coberturas y sumas del programa activo.
- Tarjeta "Beneficiarios" (nombre + parentesco + %).
- Tarjeta "Estado de pagos" con últimos 3 pagos + total al corriente/pendiente.
- Sección "Alertas" (renovación en <30 días, pago pendiente, datos faltantes).
- Fila "Accesos rápidos": descargar certificado, contactar soporte (WhatsApp `525651710563`), actualizar datos (`/portal/profile`).
- Colorear el borde superior del hero con el color del programa activo (consistencia visual con el certificado).

Extenderé `portalDashboard` para incluir beneficiarios y coberturas si aún no los devuelve.

## 3) Bug: cambio de programa no resetea la vista

Cuando se cambia de programa desde el sidebar estando en un detalle (`/policies/:id`, `/clients/:id`, `/incidents/:id`, `/payments/:id`), la app se queda en el detalle con datos del programa anterior.

Fix propuesto en `program-context.tsx` → `setActiveProgramId`:
- Detectar si la ruta actual es un detalle (`/policies/:id`, `/clients/:id`, etc.) comparando `location.pathname` contra un mapa `{ "/policies": /^\/policies\/[^/]+/, ... }`.
- Si lo es, hacer `navigate({ to: base })` a la lista raíz correspondiente.
- Invalidar queries de react-query relacionadas al programa (`queryClient.invalidateQueries()` global — simple y seguro).

Necesito inyectar `useNavigate` y `useQueryClient` dentro del provider (ya es cliente).

## 4) Notificaciones en el sidebar

Añadir en el header interno del sidebar (o al lado del email al pie) un botón campana con `DropdownMenu`:
- Query nueva `useAlertsCount` que llama a un server fn ligero `getActiveAlertsSummary(program_id)` retornando `{ count, items: [{ id, type, title, date, href }] }` — máximo 10.
- Badge rojo con el conteo si `count > 0`.
- El dropdown lista los items con link directo; footer con link a `/alerts`.
- Refetch cada 60s.

## 5) Reporte geográfico — más detalle por entidad

Al hacer click en un estado, expandir el panel lateral derecho (`aside`) con:
- Los 4 KPIs actuales (Total/Activos/Suspendidos/Vencidos).
- **Distribución por programa** (barra apilada + lista con conteo por ABC/FUT-CARE/MCV).
- **Próximas renovaciones** (siguientes 5 pólizas que vencen en <60 días, con fecha y cliente).
- **Financiero**: suma asegurada total + primas anuales acumuladas del estado.
- **Clientes**: tabla compacta paginada de los primeros 10 clientes del estado (nombre, programa, estatus, folio).

Backend: extender `getPoliciesByState` o crear `getStateDetail(state_code, program_id)` que devuelve todo lo anterior en una sola llamada, disparada al seleccionar (no al hover) para no saturar.

## Decisiones que necesito confirmar

1. **Pie MCV**: ¿Añado la línea "Programa administrado, operado y respaldado por: ZEMGO" (para uniformidad con ABC/FUT-CARE)? Actualmente MCV la omite deliberadamente.
2. **Colores exactos**: usaré los tonos aproximados que mencionaste (`#6DBE45`, `#14284E`, `#A85670`) muestreados de los logos. ¿Ok o quieres tonos específicos?
3. **Notificaciones sidebar**: ¿campana en el header interno del sidebar (arriba, junto al selector de programa) o al pie junto al email?
4. **Detalle geográfico**: ¿lista de clientes visible por defecto o detrás de un botón "Ver clientes" para no saturar el panel?

Voy a esperar tu confirmación (o respuestas puntuales a los 4 puntos) antes de implementar.