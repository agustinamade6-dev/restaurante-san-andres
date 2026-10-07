# 10. Problemas frecuentes

Problemas que ya nos pasaron, con su causa y su solución.

## Al desarrollar

### `npm run dev` falla con "failed to create junction point" (Turbopack)
**Causa:** la caché `.next/dev` quedó con un acceso directo (*junction*) copiado como carpeta real, por ejemplo
después de mover el proyecto de carpeta.
**Solución:** borrar `.next/dev` (es caché, se regenera sola) y volver a correr `npm run dev`.

### `npm run build` falla con `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
**Causa:** otro proceso tiene abierto el motor de Prisma. Casi siempre es un `npm run dev` o un servidor de pruebas
que quedó corriendo (cerrar la terminal no siempre lo mata).
**Solución:** cerrar ese servidor. Para encontrarlo en PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
```
y cerrar ese proceso (`Stop-Process -Id <número>`). Después borrar los restos `node_modules\.prisma\client\*.tmp*`.

### Errores `EPERM` al azar, o archivos "bloqueados"
**Causa:** el proyecto está dentro de **OneDrive** (o el Escritorio está sincronizado con OneDrive).
**Solución:** trabajar en una carpeta local, como `C:\dev\restaurante-san-andres`.

### No puedo entrar: "PIN incorrecto o usuario inactivo"
**Causa:** tu `dev.db` es vieja o alguien cambió los PIN.
**Solución:** borrar `prisma/dev.db` y correr `npm run db:setup` (PIN 1111 / 2222 / 3333). Si lo intentaste muchas
veces, el ingreso queda bloqueado hasta 15 minutos: reiniciar `npm run dev` lo libera.

### Cada vez que reinicio `npm run dev` me cierra la sesión
**Causa:** falta `SESSION_SECRET` en `.env`, y en desarrollo se usa una clave temporal nueva en cada arranque.
**Solución:** completar `SESSION_SECRET` en `.env` (32 caracteres o más).

### La API responde 401 o 403
- **401:** no hay sesión o venció (dura 12 horas), o el usuario fue desactivado. Volver a entrar con el PIN.
- **403:** el rol no tiene permiso para esa acción (por ejemplo, un mozo intentando editar el plano), o la
  petición viene de otro origen.

### Una pantalla muestra datos viejos
Las pantallas se actualizan por avisos en tiempo real (SSE). Si se cortó la conexión, se reconecta sola y vuelve a
pedir todo. Si una pantalla **nueva** no se actualiza, revisar que use `useSSE` y que su función de recarga pida
los datos de nuevo.

### `npx eslint .` muestra cientos de errores en archivos `.js` raros
**Causa:** revisa carpetas generadas. `release/` ya está excluida en `eslint.config.mjs`; si aparece otra carpeta
generada, agregarla ahí.

### La prueba de accesibilidad falla diciendo que hay **menos** problemas
Es a propósito: obliga a actualizar la lista `CONOCIDAS` de `e2e/accesibilidad.spec.ts` cuando se corrige algo.
Bajar el número (o borrar la entrada) en el mismo commit del arreglo.

## En la app instalada

### "El servidor del POS se detuvo"
Abrir `%APPDATA%\restaurante-san-andres\logs\server.log`. La causa más común es que **otro programa usa el puerto
3000**: cambiar `port` en `config.json`.

### Los tickets salen con datos de ejemplo
Completar la sección `negocio` de `config.json` con el nombre, CUIT y dirección reales, y reiniciar la app.

### Las tablets no pueden entrar
Poner `"lan": true` en `config.json`, reiniciar y aceptar el aviso del firewall de Windows. Las tablets entran a
`http://IP-de-la-PC:3000` (la IP se ve con `ipconfig`).

### Windows dice que el instalador puede ser peligroso
Es SmartScreen, porque el instalador no tiene firma digital: "Más información" → "Ejecutar de todas formas".

### Se perdieron datos / hay que volver atrás
En `%APPDATA%\restaurante-san-andres\backups\` hay una copia de la base por cada arranque (las últimas 15). Con la app
cerrada, reemplazar `pos.db` por la copia elegida (renombrándola a `pos.db`).

Siguiente: [Glosario](11-glosario.md).
