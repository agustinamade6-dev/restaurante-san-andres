# Commit 20 — La revalidación del SSE puede solaparse y descartar el aviso `sesion-vencida`

`fix(sse): una sola revalidación de sesión a la vez en /api/events (test intermitente en el CI)`

**Rama:** `fix/sse-vencimiento-intermitente` (desde `backend`). **Archivos:** `src/app/api/events/route.ts`, `src/__tests__/sse-events.test.ts`.

## Hallazgo — `si la sesión VENCE con la conexión abierta, también se corta` fallaba a veces
**Evidencia:** el CI del PR #15 falló en la suite completa con `TypeError: Invalid state: Controller is already closed` (`ERR_INVALID_STATE`,
`route.ts:46`); en el mismo código otras ejecuciones pasaron.
**Causa (reproducida):** el heartbeat es `async` y cada 30 s consulta la base. Si la consulta tarda más que el intervalo, dos revalidaciones quedan
en vuelo a la vez. La primera detecta la sesión vencida, encola `sesion-vencida` y cierra el stream. La segunda falla al escribir en un stream
cerrado y entra al `catch`, que llama a `controller.error()`: como el aviso aún no se leyó, el stream pasa a error y **el aviso se descarta**. El cliente
recibe un error en vez de `sesion-vencida` (se reconecta igual, pero sin el aviso explícito). Es un fallo de producción, no solo de la prueba.
**Corrección:** una bandera `revalidando`: mientras una revalidación sigue en curso, los ticks siguientes no hacen nada. Se libera en `finally`.
**Prueba:** `REGRESIÓN: con la base lenta, dos revalidaciones solapadas no descartan el aviso "sesion-vencida"` retiene la consulta con una promesa,
deja pasar dos heartbeats, la libera y deja terminar ambas revalidaciones antes de leer. Falla sin el arreglo y pasa con él (5 de 5 ejecuciones).

## Cambios visibles para el frontend
Ninguno de contrato. En el caso de base lenta, el cliente ahora recibe `sesion-vencida` (y el cierre) en lugar de un error de lectura.

## Lección
L-079 (ver `docs/lecciones-aprendidas.md`, fila 33).
