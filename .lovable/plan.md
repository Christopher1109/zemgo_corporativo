# Turno A — Certificados, campos por programa y referencias bancarias

## 1. Certificados PDF (réplica exacta de los 3 formatos)

Reemplazo el generador actual por un componente React-PDF parametrizado por programa. Mismo layout, mismas tablas, mismos textos legales — solo cambian colores y logo.

**Paleta por programa**
- ABC de Protección: verde `#7CB342`, logo circular verde
- FUT-CARE: azul marino `#1B2A55`, logo "FUT-CARE TU SEGURO FUTBOLERO"
- Manos con Valor: vino `#A23B5C`, logo "Manos con Valor"

**Estructura compartida**
- Header: logo + "CERTIFICADO DE COBERTURA" + dirección Monterrey + FOLIO
- Sección "Ramo del seguro" + "Fecha de Emisión" (en MCV solo fecha, sin ramo)
- Banner "ASEGURADO TITULAR" con datos del cliente
- Banner "TABLA DE COBERTURA(s) CONTRATADA(s)" con coberturas por programa (sembradas desde `program_coverages`)
- Banner "BENEFICIARIOS" con tabla de 2 filas mínimas
- Banner "FIRMAS" con advertencia legal idéntica al PDF, vigencia y firmas
- Footer: "Programa administrado, operado y respaldado por HOPE CONSULTING" + URL Zemgo

Subo los 3 logos a Lovable Assets para reusarlos.

## 2. Campos por programa al alta de cliente/póliza

Hoy el formulario pide los mismos campos para todos los programas. Lo hago condicional según el `program_code` seleccionado:

**ABC de Protección** (más exhaustivo)
- Nombres, Apellidos, Fecha de Nacimiento, **Edad** (auto-calculada), **Género**, **Estado Civil**, CURP, **Dependientes (texto libre: cónyuge e hijos)**, Dirección, Celular, Correo

**FUT-CARE**
- Nombres, Apellidos, Fecha de Nacimiento, Género, CURP, Dirección, Celular, Correo
- (sin Edad explícita, sin Estado Civil, sin Dependientes)

**Manos con Valor**
- Mismos campos que FUT-CARE

**Implementación**
- Tabla `clients`: ya tiene `marital_status` y otros campos opcionales. Agrego `program_specific_data jsonb` para guardar lo que no encaje (ej. dependientes de ABC como string).
- Componente `ClientForm` lee `program.code` del contexto y muestra/oculta secciones con un schema Zod por programa.
- Validación: campos requeridos solo cuando aplican al programa.

## 3. Stub de referencias bancarias

**Generación determinística (sin integración bancaria todavía)**
- Función `generate_bank_reference(payment_id)` que devuelve referencia de 20 dígitos: prefijo de convenio (4) + folio póliza compacto (8) + AAMM del cargo (4) + check digit (4).
- Al crear un `payment` con status `pending` se calcula y se guarda en `payments.bank_reference`.

**UI**
- En la pantalla de póliza y en el listado de pagos: chip copiable "Ref. 1234 5678 9012 3456 7890" + botón "Descargar ficha PDF" (formato simple con instrucciones para Banorte).
- Tab "Referencias pendientes" en `/payments` con todos los pagos pendientes y sus referencias.

**Endpoint de conciliación listo**
- `POST /api/public/hooks/bank-reconciliation` que acepta:
  ```json
  { "referencia": "...", "monto": 100.00, "fecha_pago": "2026-06-19", "auth_code": "..." }
  ```
- Verifica firma HMAC con `BANK_WEBHOOK_SECRET` (lo agregamos antes de hacer la integración real).
- Hace match contra `payments.bank_reference`, valida monto, marca `status='paid'`, registra en `payment_reconciliations` (tabla nueva con `source='webhook'|'manual'`).
- Log de cada intento en `bank_reconciliation_log` para debug.
- Mientras tanto, botón "Marcar como pagado" en la UI hace el mismo flujo con `source='manual'` para que se vea funcionando en la demo.

## Detalles técnicos

- **Migraciones**: añadir `clients.program_specific_data jsonb`, `payments.bank_reference text unique`, tablas `payment_reconciliations` y `bank_reconciliation_log`, función `generate_bank_reference`.
- **PDF**: nuevo `src/lib/pdf/templates/CertificadoCobertura.tsx` con variantes por programa; el viejo certificado se borra.
- **Forms**: `src/components/clients/ClientForm.tsx` se parte en `BaseFields` + `<ProgramSpecificFields program={code} />`.
- **Endpoint**: `src/routes/api/public/hooks/bank-reconciliation.ts`; usa `supabaseAdmin` cargado dentro del handler tras verificar firma.
- **No tocamos**: alertas, mapa, plantillas de WhatsApp/Email (Turno B).

## Lo que NO incluye Turno A
- Sistema de alertas de pago (Turno B)
- Mapa de México con Mapbox (Turno B — necesitaré `MAPBOX_TOKEN` cuando lleguemos)
- Plantillas WhatsApp/Email (pendiente, lo dejamos para Turno C)
- Portal cliente y bot (fuera de alcance acordado)

Cuando termine Turno A te entrego: URLs de los 3 certificados de muestra, screenshots del formulario por programa, ejemplo de payload del endpoint de conciliación, y conteo de archivos cambiados.
