# Zemgo Corporativo

Construye una plataforma SaaS interna para HOPE Consulting, una administradora

mexicana de tres programas de seguros independientes. La plataforma debe permitir

gestionar clientes, pólizas, pagos, siniestros y renovaciones de cada programa

de forma centralizada pero con segmentación visual y lógica clara entre ellos.

LOS TRES PROGRAMAS son:

1. ABC de Protección — Color VERDE (#2E7D32 primario, #A5D6A7 secundario,

   #1B5E20 acento). Ramo: AP, Vida y funerarios. Cobro mensual de $160 MXN.

2. FutCare — Color AZUL (#1565C0 primario, #90CAF9 secundario, #0D47A1 acento).

   Ramo: AP Deportivo. Cobro único en una sola exhibición.

3. Manos con Valor — Color VINO (#722F37 primario, #C9A0A6 secundario,

   #4A1F26 acento). Ramo: AP y funeraria. Cobro por definir.

CARACTERÍSTICA VISUAL CRÍTICA:

La interfaz debe cambiar de color automáticamente al cambiar de programa.

Implementa un ProgramContext con React Context que exponga el programa

activo, y un ThemeProvider que aplique los colores del programa actual a

todo el layout (sidebar, headers, botones primarios, acentos, badges).

Cuando el usuario cambia de programa desde el selector, toda la UI debe

reflejar el cambio inmediatamente sin recargar la página.

ARQUITECTURA GENERAL:

- Frontend: React + TypeScript + Tailwind + shadcn/ui (default de Lovable)

- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)

- Auth: Supabase Auth con email/password. Usuarios internos solamente

  en esta primera fase (no portal de cliente todavía).

- Multi-tenancy: TODA query a tablas operativas (clientes, pólizas, pagos,

  siniestros) DEBE filtrarse por program_id. Activa Row-Level Security en

  todas las tablas sensibles.

MODELO DE DATOS QUE NECESITAS CREAR:

programs (catálogo de los 3 seguros, con los colores ya definidos arriba)

profiles (extiende auth.users de Supabase con full_name, phone, is_active)

roles (admin, manager, operator, claims, sales, viewer)

user_program_access (vincula un user a un programa con un rol específico —

un usuario puede ser admin de ABC pero solo viewer de FutCare)

clients (first_name, last_name, curp único, rfc, date_of_birth, gender,

marital_status, email, phone, dirección completa: street, number, colonia,

city, state, zip; referral_source_id, sales_rep_id, created_by)

client_programs (relación N:N entre clients y programs, con status:

prospect/active/inactive/cancelled, enrolled_at, cancelled_at)

policies (folio único, policy_number, certificate_number, program_id,

client_id, issue_date, start_date, end_date, sum_insured, deductible,

premium, status: draft/pending_payment/active/expired/cancelled/suspended,

contracting_party, certificate_pdf_url)

program_coverages (catálogo de coberturas fijas por programa con

sum_insured y description — ver SEED DATA abajo)

beneficiaries (policy_id, full_name, relationship, percentage,

display_order)

dependents (policy_id, full_name, relationship, date_of_birth —

solo aplica al programa ABC)

payment_schedules (policy_id, is_recurring, frequency: monthly/yearly/

one_time, amount, next_due_date, auto_charge, reminder_days_before

default 10)

payments (policy_id, amount, due_date, paid_at, method: bank_reference/

bank_transfer/cash/card/oxxo/manual, status: pending/processing/paid/

failed/refunded/cancelled/overdue, bank_reference, provider, provider_

transaction_id, reconciled, failure_reason)

incidents (policy_id, client_id, occurred_at, location_description,

hospital, description, status: reported/pending_review/pass_issued/

in_treatment/closed/rejected, approved_at, approved_by)

medical_passes (incident_id, policy_id, snapshot completo de datos del

asegurado al momento de emisión, valid_from, valid_until con vigencia

de 48hrs, director_signature_url, pdf_url)

documents (owner_type: client/policy/incident, owner_id, kind, file_url,

file_name, mime_type, uploaded_by)

audit_log (user_id, program_id, entity_type, entity_id, action, diff

JSONB, ip_address, created_at)

system_config (key-value para configuraciones globales)

REGLAS DE NEGOCIO IMPORTANTES:

1. Los siniestros NO emiten pase médico automáticamente. El flujo es:

   cliente reporta incidente → operador de siniestros revisa → aprueba

   manualmente → el sistema genera el PDF del pase médico con vigencia

   de 48hrs. Esto mitiga riesgo de siniestralidad.

2. Las coberturas son FIJAS por programa, no se editan por póliza.

   Vienen del catálogo program_coverages.

3. La integración con pasarela de pago Y con la API del banco están

   APAGADAS por ahora. El campo "method" en payments soporta

   bank_reference (para futura integración con Banorte), pero por ahora

   los pagos se registran manualmente. Deja la arquitectura preparada.

4. WhatsApp y la integración con la aseguradora también quedan apagados

   inicialmente. Solo deja la estructura lista (notification_templates,

   notifications con channel: email/whatsapp/sms/in_app).

5. Todas las operaciones sensibles (alta/baja/edición de clientes,

   pólizas, pagos, usuarios) deben generar un registro en audit_log

   automáticamente.

SEED DATA (insértalo en seeds al final):

programs:

- code='ABC', name='ABC de Protección', insurance_branch='AP, Vida y funerarios', colores verdes ya definidos arriba

- code='FUTCARE', name='FutCare', insurance_branch='AP Deportivo', colores azules ya definidos arriba

- code='MCV', name='Manos con Valor', insurance_branch='AP y funeraria', colores vino ya definidos arriba

program_coverages para ABC:

- DEATH: 'Por fallecimiento', $100,000

- ACC_DEATH_ADULT: 'En Muerte accidental, personas mayores de 18 años, apoyo de:', $50,000

- ACCIDENT_MED: 'Atención Médica por accidente', $25,000

- FUNERAL: 'Servicios funerarios', $25,000

program_coverages para FUTCARE:

- SPORTS_ACC: 'Accidentes deportivos en competencia, entrenamiento y traslados sin escala.', $75,000

- SPORTS_DEATH: 'Muerte accidental a causa de un accidente durante el partido o entrenamiento', $150,000, nota: 'en menores de 12 años aplica cobertura de gastos funerarios'

- ORGANIC_LOSS: 'Pérdidas Orgánicas', $150,000

program_coverages para MCV:

- FUNERAL_ASSIST: 'Asistencia funeraria y telefónica', is_included=true (sin monto, dice "INCLUIDA")

- ACCIDENT_MED: 'Atención Médica por accidente', $50,000

- ACC_DEATH: 'Muerte accidental', $100,000, nota: 'en menores de 12 años aplica gastos funerarios'

roles:

- admin: Administrador (acceso total)

- manager: Líder de programa

- operator: Operador (CRUD de clientes y pólizas)

- claims: Siniestros

- sales: Ventas

- viewer: Solo lectura

system_config:

- payment.reminder_days_default = 10

- medical_pass.validity_hours = 48

- integration.banorte.enabled = false

- integration.whatsapp.enabled = false

- integration.insurer_api.enabled = false

LO QUE QUIERO EN ESTE PRIMER ENTREGABLE:

1. Login con Supabase Auth (email/password)

2. Layout principal con sidebar a la izquierda, header arriba, área

   principal a la derecha

3. El sidebar muestra un SELECTOR DE PROGRAMA prominente en la parte

   superior. Al cambiar de programa, TODO el layout cambia de color

   (verde / azul / vino según el programa).

4. El sidebar tiene navegación a: Dashboard, Clientes, Pólizas, Pagos,

   Siniestros, Reportes, Configuración. Por ahora solo Dashboard y

   Clientes deben estar funcionales, el resto pueden ser placeholders.

5. Dashboard con tarjetas de métricas básicas (clientes activos,

   pólizas vigentes, pagos del mes, siniestros abiertos) — vacías o

   con datos seed por ahora.

6. Página de Clientes con: listado en tabla (nombre, CURP, teléfono,

   email, programa, fecha de alta, estado), buscador por nombre/CURP,

   filtros por programa y estado, botón "Nuevo cliente".

7. Formulario de alta de cliente con TODOS los campos del modelo

   clients, más selección del programa al que se afilia.

8. Crea todas las tablas con sus relaciones, activa Row-Level Security

   en clients, policies, payments, incidents, medical_passes,

   documents, audit_log. Las políticas RLS deben permitir acceso solo

   a usuarios autenticados con permiso en el programa correspondiente

   (vía user_program_access).

9. Inserta los seed data de programs, program_coverages, roles y

   system_config.

NO HAGAS TODAVÍA:

- Generación de PDFs de certificados (eso viene en un prompt aparte)

- Portal del cliente final (asegurado)

- Bot de atención

- Integraciones externas (banco, WhatsApp, aseguradora)

- Reportes geográficos

Cuando termines, dame un resumen de:

- Qué tablas creaste y sus relaciones

- Qué políticas RLS activaste

- Cómo se prueba el cambio de tema por programa

- Qué pantallas quedaron funcionales vs placeholder

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://colorado-guardian.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4f47a57f-df35-4c42-bc69-15a3f5f0d29c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
