# Vendedores, empresas y siniestros

Ya hecho en esta respuesta: se quitó del menú lateral la sección "Integraciones" y el enlace de Google Sheets (el sync automático sigue corriendo por detrás).

## 1. Comisiones por evento (nuevo modelo)

Hoy la comisión se calcula con escalones sobre la prima total. Se reemplaza por comisión por pago cobrado:

- Primer pago de un cliente nuevo: 20% del monto pagado.
- Cualquier pago posterior (renovación mensual de ABC, renovación anual de FutCare y Humanos con Valor): 10% del monto pagado.

Reglas:
- La comisión se genera solo cuando el pago queda marcado como pagado/conciliado.
- Se guarda como registro propio (vendedor, certificado, pago, tipo nuevo/renovación, porcentaje, monto) para que quede historial auditable y no se recalcule al cambiar tarifas.
- Los pagos ya pagados se cargan una vez hacia atrás para que el panel arranque con datos reales.

## 2. Nueva vista de cartera del vendedor

Reemplaza la lista plana actual:

- Encabezado con: comisión del mes en curso, comisión pagada acumulada del año, prima cobrada y número de clientes.
- Desglose del mes: cuánto viene de clientes nuevos (20%) y cuánto de renovaciones (10%).
- Cartera agrupada por estado del cliente: activo, prospecto, suspendido/inactivo, vencido — con conteo por grupo y filtro rápido.
- Cada renglón: cliente, programa, folio, estado, próxima fecha de pago, monto y comisión asociada.
- Sección "Próximas renovaciones" con la comisión estimada que generará cada una.
- Se conservan las acciones actuales: agregar certificado, quitar certificado, eliminar vendedor.

## 3. Clientes tipo Empresa

En "Nuevo cliente" se pregunta primero: Empresa o Persona.

Empresa:
- Se captura razón social, RFC, contacto y programa; queda como carpeta, no como certificado individual.
- Dentro de la empresa: botón para descargar la plantilla Excel con las columnas requeridas (nombre, apellidos, CURP, RFC, fecha de nacimiento, género, estado civil, dependientes, email, teléfono, domicilio).
- Botón para subir el Excel devuelto por la empresa: el sistema valida fila por fila, muestra errores (CURP inválido, duplicado, campos faltantes) y crea un certificado por persona en estado pendiente.
- Panel de la empresa con avance: cargados / aprobados / pagados.
- Cuando todos están aprobados y pagados, botón "Descargar certificados" que entrega un ZIP con un PDF por empleado.

Consolidación:
- En "Clientes" y "Certificados" la empresa aparece como un solo renglón (p. ej. "Sams — 200 asegurados"); el desglose vive dentro del detalle de la empresa, no en la lista general.

## 4. Siniestros: carta de aviso de accidente

- En el detalle del siniestro, la sección "Pases médicos" se renombra a "Carta de aviso de accidente".
- Se muestra la carta correspondiente a ese siniestro, con la información que llenó el cliente en el portal, guardada en la base de datos.
- Botón de descarga del PDF; si aún no existe archivo, se genera al momento a partir de los datos guardados.

## Detalles técnicos

- Nueva tabla `sales_commissions` (vendedor, pago, certificado, tipo, porcentaje, monto, periodo) más trigger/actualización en el flujo de `mark_payment_paid` y de conciliación bancaria.
- Nueva tabla `companies` (o `client_groups`) + `company_id` en `clients`/`policies` para consolidar y para el flujo de carga masiva; registro de cada importación con su resultado por fila.
- Importación y plantilla Excel en servidor con `xlsx`; generación del ZIP reutilizando los renderers PDF existentes por programa.
- La carta de aviso reutiliza el registro actual de pases (`medical_passes`) renombrado en UI y consultado solo por `incident_id`, sin filtrar por estado.

## Orden de entrega

1. Comisiones + nueva vista de cartera del vendedor.
2. Carta de aviso de accidente en siniestros.
3. Empresas: alta, plantilla, importación de Excel, consolidación y ZIP de certificados.
