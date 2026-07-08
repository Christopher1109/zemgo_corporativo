# Plan de trabajo — Ajustes plataforma ZEMGO

Son 12 bloques. Los agrupo por dependencia y propongo ejecutarlos en 4 fases para poder mostrarte avances intermedios y no bloquearte esperando todo junto. Puedes reordenar o quitar bloques antes de aprobar.

Muy importante antes de empezar: **necesito que me subas los 3 PDFs modelo de certificados (ABC, FUT-CARE, Manos con Valor) y los 3 logos PNG con fondo transparente**. Ya tengo la Carta Aviso de Accidente que subiste. Sin los PDFs modelo puedo aproximar el layout con las descripciones, pero el punto 1 no va a quedar "visualmente idéntico" como pides sin las referencias.

---

## Fase A — Correcciones críticas y bugs (arranca ya)

### 1. Certificados PDF parametrizados por programa (bloque 1)
Reescribir los 3 templates React-PDF (`CertificateABC/FutCare/MCV.tsx`) con la estructura exacta que describes: header 3 columnas con logo + título + dirección/folio, fila Ramo/Fecha (sin Ramo en MCV), franjas de color por sección, tablas con bordes, texto legal, firmas, footer con link. Un solo componente base `CertificateLayout` parametrizado por `{ programCode, color, logoUrl, insurerFooter, coverages }` — cada programa solo pasa su config.
Paleta inicial: ABC `#6DBE45`, FUT-CARE `#14284E`, MCV `#A85670` (ajusto al ver logos).

### 3. Bug: reset de contexto al cambiar de programa
En el `ProgramContext` provider, al cambiar `program_id` disparar `router.navigate({ to: currentSectionRoot })` — es decir, si estoy en `/policies/$id` me manda a `/policies`, si estoy en `/clients/$id` a `/clients`, etc. Se hace con un `useEffect` que escucha cambio de programa y detecta la ruta base actual.

### 6. Folio automático de certificado
Ya existe `next_policy_folio(program_id)` y `policy_folio_counters`. Solo hay que **quitar el input de folio del formulario `/policies/new`** y dejar que el backend lo genere. Cambio menor.

---

## Fase B — Portal del asegurado (bloques 2, 7, 11, 12)

### 2. Dashboard del portal enriquecido
Reemplazar la pantalla actual con tarjetas: pólizas activas con días restantes (barra de progreso), coberturas + sumas aseguradas, estado de pagos, beneficiarios, accesos rápidos (descargar certificado, contacto, actualizar datos), alertas activas. Estilo con color del programa.

### 7. Siniestros: auto-aprobación + Carta Aviso de Accidente
- Modificar `report_portal_incident` para que marque `status='authorized'` directo (sin flujo de revisión).
- Quitar del admin los botones de aprobar/rechazar; dejar solo listado read-only.
- Nuevo template PDF `AccidentNoticeHIR.tsx` fiel al PDF que subiste: logo HIR naranja, campos autocompletados (contratante, póliza, asegurado, fecha nac, CURP, certificado, suma asegurada), campos manuales (deducible, fecha/hora accidente, descripción, hospital), texto de responsabilidad, firma Graciela Rivera Bersoza con imagen, aviso 48 hrs en naranja, aviso de privacidad HIR, footer azul con contacto.
- Botón "Descargar Aviso de Accidente" en la vista del siniestro del portal, disponible inmediatamente al reportar.

### 11. Chatbot FAQ pop-out en el portal
Widget flotante con burbuja, panel con las 6 preguntas placeholder y respuestas cortas editables desde un archivo `portal-faq.ts` para que luego solo cambien el texto.

### 12. Bloques "Alcance" y "Qué hacer en caso de siniestro"
Dos secciones colapsables en el detalle de póliza del portal, con texto placeholder editable desde un solo archivo por programa.

---

## Fase C — Admin y operación (bloques 4, 5, 8)

### 4. Notificaciones en sidebar
Ícono de campana con badge de conteo (alertas + renovaciones activas) que despliega un dropdown con los últimos 10 items y link "Ver todas".

### 8. Semáforo de alertas por periodicidad
Detectar si el programa/póliza es mensual o anual (por `payment_schedules.frequency` o duración de vigencia). Aplicar:
- Mensual: verde / naranja ≤15d / rojo ≤10d
- Anual: verde / naranja ≤30d / rojo ≤15d

### 5. Reporte geográfico con desglose
Al hacer click en un estado, panel lateral (Sheet lateral derecho) con: lista de clientes de la entidad, próximas renovaciones, monto asegurado total + primas, distribución por programa (barras/donut). El mapa se mantiene igual.

---

## Fase D — Módulos nuevos (bloques 9, 10)

### 9. Gestión de usuarios y roles en Configuración
Nueva tab en `/settings` "Usuarios":
- Tabla de usuarios con rol y programas asignados
- Formulario de alta (email + rol + checkboxes de programas)
- Editar / desactivar
- Roles predefinidos: `admin`, `despacho`, `vendedor` (ya existe el enum `app_role`, extender si falta)
- Usa `user_program_access` + Auth Admin API vía server function con `has_role('admin')`

### 10. Módulo Vendedores / Comisiones
- Nueva entrada en sidebar
- Nueva tabla `commission_tiers` (rango min/max clientes, %) editable desde Configuración
- Nueva tabla `sales_rep_assignments` (o usar campo existente en `policies`) para ligar póliza→vendedor
- Vista admin: lista de vendedores con comisión del período, click → perfil con desglose
- Vista vendedor (rol `vendedor`): solo su cartera + panel motivacional ("Llevas $X, con 5 clientes más subes a $Y")
- Datos de ejemplo/placeholder donde falte info real

---

## Detalles técnicos

- **DB migraciones nuevas**: `commission_tiers`, posiblemente ampliar `incidents.status` para saltar aprobación, agregar `is_authorized_auto` flag en audit. Todas con GRANT + RLS.
- **PDF**: reutiliza el pipeline actual (React-PDF en browser → `saveCertificatePdf` sube a Storage). La Carta de Accidente usa el mismo patrón, bucket `medical-passes` o nuevo `accident-notices`.
- **Rutas nuevas**: `/settings/users`, `/sales-reps`, `/sales-reps/$id`, `/portal/incidents/$id/notice.pdf` (server route para PDF).
- **Sin cambios en**: auth core, esquemas Supabase gestionados, secretos.

---

## Fuera de alcance (confirmado por ti)

Permisos finos por rol, contenido oficial de "Alcance" y "Qué hacer", aviso de privacidad Zemgo, valores reales de comisiones, dominio, integración web.

---

## Estimación de rondas

- **Fase A**: 1-2 rondas (necesito los 3 PDFs modelo y logos antes de empezar el bloque 1)
- **Fase B**: 2 rondas
- **Fase C**: 1-2 rondas
- **Fase D**: 2-3 rondas

Total ~7-9 rondas de trabajo. Al final de cada fase te muestro capturas/preview antes de cerrar.

---

**Antes de aprobar, dime:**
1. ¿Tienes los 3 PDFs modelo de certificados y los 3 logos PNG para adjuntar? (crítico para bloque 1)
2. ¿Empiezo por Fase A completa, o prefieres que arranque solo por el bloque 1 (certificados) mientras juntas el resto?
3. ¿Algún bloque que quieras posponer o quitar?
