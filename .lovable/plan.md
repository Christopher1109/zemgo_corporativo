## Paso 1 — Resultado de la auditoría (verificado en base de datos y código)

**Sí hay RLS real, y ya no es solo visual.** Estado actual confirmado con consultas:

1. **Programas**: la tabla `programs` solo devuelve los programas donde el usuario tiene fila en `user_program_access`. La causa original de "la operadora ve los tres" no era un bug de código: el seed le dio acceso a FUTCARE, ABC y MCV en la tabla de accesos.
2. **Módulos (checkboxes)**: antes eran solo visuales. Hoy las políticas RLS de `clients`, `client_programs`, `policies`, `payments`, `payment_schedules`, `incidents`, `medical_passes`, `hospitals`, `beneficiaries`, `dependents`, `sales_reps` y `commission_tiers` usan `can_read_program_module` / `can_write_program_module`, es decir, el filtro por módulo ya se aplica a nivel de datos.
3. **Roles**: `admin@hope.local` es el único en `platform_admins` → único Superadministrador (única cuenta con Integraciones). Los 5 usuarios pedidos (abelardo, alejandro, alan.gomez, ing.javier, saira) ya están como **admin** en FUTCARE, ABC y MCV con todos los módulos.
4. **Configuración/Usuarios**: las funciones de gestión (`update_user_program_access`, `deactivate_user`, `reactivate_user`, `delete_user_account`) exigen `can_manage_users` = Superadmin o admin de programa. Crear y **eliminar** usuarios ya existe.
5. **Integraciones**: las server functions de Google Sheets exigen Superadministrador; el sidebar y el guard de ruta también.

## Hallazgo pendiente

- `christocr9@gmail.com` figura como **admin en los 3 programas** y no está en tu lista de 5. Eso le da acceso a Configuración y gestión de usuarios.

## Qué haría a continuación

1. **Ajustar `christocr9@gmail.com`**: bajarlo a operator (o quitarle acceso) según me indiques — o dejarlo si es tu cuenta.
2. **Verificación en vivo**: iniciar sesión como una operadora acotada (ej. `laura.castro`, con solo pagos/finanzas/vendedores) y comprobar por navegador que:
   - el selector de programas solo muestra los suyos,
   - `/clients`, `/incidents`, `/settings` y `/admin/integrations/google-sheets` quedan bloqueados por URL directa,
   - las consultas a la API devuelven vacío/denegado para esos módulos.
3. **Corregir lo que falle** en esa verificación (política o guard que se haya escapado) y reportar el resultado.

### Detalle técnico
La verificación se hace con Playwright contra localhost restaurando la sesión, más consultas directas comprobando `can_read_program_module` para el usuario de prueba.

¿Qué hago con `christocr9@gmail.com`?