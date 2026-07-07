# Red de Hospitales por Programa

## Objetivo
Cada programa (ABC, FutCare, MCV, etc.) tiene una red de hospitales autorizados. El admin los administra desde el sidebar; el cliente los ve al reportar un siniestro, ordenados por cercanía a su ubicación.

## 1. Base de datos
Nueva tabla `hospitals`:
- `program_id` (FK a programs)
- `name`, `address`, `city`, `state`, `phone`
- `lat`, `lng` (numeric, opcionales)
- `notes` (texto libre — especialidades, horarios, etc.)
- `is_active` (bool, default true)
- timestamps

Nueva columna en `incidents`:
- `hospital_id` (FK opcional a hospitals) — para saber a qué hospital acudió el cliente.

RLS:
- Admin/staff con acceso al programa: CRUD completo.
- Usuarios del portal (anon vía RPC): SELECT de hospitales activos del programa de su póliza.

## 2. Admin — Sidebar del programa
Nuevo item **"Hospitales"** en el sidebar de cada programa (junto a Clientes, Pólizas, Siniestros, etc.).

Ruta: `/programs/$programId/hospitals`
- Tabla con columnas: Nombre, Ciudad, Teléfono, Estado (activo/inactivo), acciones.
- Botón "Agregar hospital" → modal con formulario.
- Editar / desactivar / eliminar por fila.
- Campo de coordenadas: input manual O botón "Buscar en mapa" (geocoding con Google Maps connector si está disponible, si no, manual).

## 3. Portal cliente — Reportar siniestro
En `/portal/incidents/new`, al lado del campo "Hospital al que acudió":

1. Al montar el formulario, pedir permiso de geolocalización (`navigator.geolocation.getCurrentPosition`) con un banner explicativo "Permite tu ubicación para mostrar los hospitales más cercanos".
2. Cargar hospitales activos del programa de la póliza seleccionada vía nuevo server fn público (`getHospitalsForPolicy`).
3. Reemplazar el input de texto libre por un **Select** con la lista de hospitales:
   - Si hay ubicación del usuario y coords del hospital → calcular distancia (haversine) y ordenar por cercanía; mostrar "· 2.3 km".
   - Si no hay ubicación → orden alfabético.
   - Opción "Otro" al final para permitir texto libre como fallback.
4. Guardar `hospital_id` en el incidente (más el texto libre si eligió "Otro").

## 4. Detalles técnicos
- Migración SQL con GRANTs + RLS + triggers de `updated_at`.
- Server fns:
  - `listHospitals({ programId })` — admin, requiere auth + acceso al programa.
  - `upsertHospital(...)`, `deleteHospital(id)` — admin.
  - `getHospitalsForPolicy({ policyToken })` — portal, usa el token del portal.
- Cálculo de distancia en el cliente (haversine simple, no requiere API externa).
- Geocoding para admin: opcional, con el connector de Google Maps ya integrado.

## Fuera de alcance (por ahora)
- Mapa interactivo con pins (solo lista ordenada).
- Rutas / direcciones al hospital.
- Notificar al hospital automáticamente.

¿Procedo así, o quieres ajustar algo (por ejemplo, mapa visual en el portal, o hospitales compartidos entre programas)?
