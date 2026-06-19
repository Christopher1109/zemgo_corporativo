## Plan de cambios

Trabajo dividido en bloques. Los puntos **(A) Formato ABC** y **(B) Certificado de póliza** quedan pendientes hasta que subas los archivos — no los incluyo aquí.

---

### 1. Dashboard — reacomodo completo

**Quitar:** Top 10 deudores, Distribución de pólizas activas (gráfica), tamaño excesivo de las demás gráficas.

**Dejar / mover arriba:**
- KPIs financieros nuevos en la fila superior: **Por cobrar**, **Cobrado del mes**, **Vencido**, **Nuevos clientes (mes)**.
- **Atención inmediata** (la que ya existe) baja un nivel.
- **Alertas y renovaciones** → bloque destacado arriba con los próximos a vencer (7/15/30 días) y vencidos, con enlace al módulo.
- **Pendientes de siniestros** → tarjeta con conteos por estado (abiertos, en revisión, cerrados del mes).
- **Pases médicos pendientes** → tarjeta con "por aceptar" y "por realizar".
- **Últimos clientes registrados** (lista 5–8).
- **Actividad reciente** (audit_log resumido: pagos, altas, siniestros, pases).
- **Cobranza por mes** se queda, pero en tamaño compacto.
- **Shortcuts**: Nuevo cliente, Registrar pago, Reportar siniestro, Nuevo pase.

### 2. Nuevo módulo "Finanzas" en sidebar

Mover ahí TODO el dashboard de cobranza que hoy está arriba en /payments:
- Cobranza mensual
- Top 10 clientes (este sí aquí, no en dashboard)
- Pagos por método
- Pagos pendientes, próximos, estimaciones, sugerencias

`/payments` queda solo con el listado + acciones. Sidebar: **Finanzas** (ícono Wallet/TrendingUp).

### 3. Alertas y renovaciones — visual semáforo + filtros

- Tarjeta completa del cliente coloreada:
  - **Rojo** (bg + borde): vencido
  - **Naranja**: ≤ 7 días por vencer
  - **Sin color**: > 7 días
- Filtros nuevos: **Todos / Vencidos / ≤7 días / ≤15 días / ≤30 días / >30 días**.
- Buscador por cliente / póliza.

### 4. Reportes — vista unificada con tabs

- Quitar la tarjeta "Mapa de pólizas" actual rota y reemplazar por una tarjeta llamada **Análisis geográfico** que abre `/reports?tab=geo`.
- `/reports` por defecto abre **Cartera de clientes**.
- **Tabs horizontales arriba**: Cartera · Cobranza · Siniestralidad · Renovaciones · Ventas por vendedor · Actividad del sistema · Análisis geográfico.
- Cada tab renderiza el reporte ahí mismo + botones **Exportar PDF / Excel / CSV**.
- Quitar "Mapa México" del sidebar.
- Renombrar ruta `/reports/map` → integrada como tab `geo` (la ruta vieja redirige).

### 5. Sidebar — limpieza

- Quitar **Administración de usuarios**.
- Quitar **Seats demo**.
- Quitar **Mapa México**.
- Agregar **Finanzas**.

### 6. Siniestros — verificación

Revisar el formulario de reporte de siniestro contra los campos que la tabla `incidents` espera y confirmarte qué pide hoy vs. qué falta. Si está completo, no toco nada y te lo confirmo. Si falta algo evidente, te lo listo antes de cambiarlo.

---

### Detalles técnicos

- **Dashboard**: nuevas RPC `get_dashboard_financials()` (sumas por cobrar / cobrado mes / vencido) y `get_dashboard_pending_ops()` (siniestros y pases por estado). Reutilizo `getAlertsOverview` para el bloque de alertas.
- **Finanzas**: nueva ruta `/_authenticated/finance.tsx` que monta los componentes que hoy viven dentro de `payments.tsx`. Extraigo esos componentes a `src/components/finance/*` para reutilizar.
- **Reportes**: refactor a `/_authenticated/reports.tsx` con `<Tabs>` shadcn + estado en URL search param. La ruta `/_authenticated/reports.map.tsx` redirige a `/reports?tab=geo`. Exportación: `papaparse` (CSV) + `xlsx` (Excel) + `@react-pdf/renderer` (PDF, ya instalado).
- **Alertas**: actualizo `src/routes/_authenticated/alerts.tsx` con clases condicionales tipo `bg-destructive/10 border-destructive` y `bg-orange-500/10 border-orange-500`, filtro de bucket por días.
- **Sidebar**: editar `src/components/app-shell.tsx` (quitar entradas, agregar Finanzas).
- Sin cambios de DB salvo las 2 RPC mencionadas (read-only, sin tablas nuevas).

---

### Pendientes que NO se tocan en este turno

- (A) Alta de cliente al formato ABC — espero archivo.
- (B) Plantilla del certificado — espero archivo.
- (C) Verificación detallada del formulario de siniestros — te confirmo después de revisarlo, sin cambios si está completo.
