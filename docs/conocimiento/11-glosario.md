# 11. Glosario

| Palabra | Qué significa acá |
|---|---|
| **Anulación** | Asiento en negativo que deshace una venta sin borrarla. Lo hace un ADMIN desde Caja, con motivo. |
| **API** | Las rutas del servidor que reciben y devuelven datos (`/api/...`). Las pantallas solo hablan con la base a través de ellas. |
| **asar** | El archivo comprimido donde Electron guarda el código de la app. El servidor de Next.js **no** puede ir ahí adentro. |
| **axe** | Herramienta que revisa automáticamente la accesibilidad de una página. |
| **Backend** | La parte del servidor: API, base de datos, reglas. |
| **CI** | *Integración continua*: GitHub corre las pruebas solo en cada pull request. |
| **Comanda** | El pedido que el mozo envía a la cocina. |
| **Contraste AA** | Nivel mínimo de diferencia entre el color del texto y el del fondo (4.5:1 para texto chico) para que se lea bien. |
| **Cookie de sesión** | Dato que el navegador guarda al entrar con el PIN y manda en cada petición. Está firmada y dura 12 horas. |
| **CSRF** | Ataque en el que otro sitio intenta usar tu sesión. Se evita revisando el origen de cada petición. |
| **e2e** | Pruebas *de punta a punta*: un navegador real usa la app como lo haría una persona. |
| **Electron** | Herramienta que convierte una app web en un programa de escritorio (`.exe`). |
| **Frontend** | Las pantallas: lo que se ve y se toca. |
| **Hash** | Transformación de un dato (como el PIN) que no se puede revertir. Sirve para comparar sin guardar el dato original. |
| **Hook** | En React, una función `useAlgo()` que agrega comportamiento a una pantalla (cargar datos, escuchar avisos...). |
| **Idempotente** | Que repetir la operación da el mismo resultado: cobrar dos veces el mismo pedido no cobra dos veces. |
| **Insumo** | Ingrediente o materia prima con stock (carne, aceite, cerveza). |
| **KDS** | *Kitchen Display System*: la pantalla de Cocina. |
| **Merge** | Mezclar una rama en otra. |
| **Migración** | Cambio en la forma de la base de datos que se aplica solo, sin perder datos. |
| **Mutación (pruebas de)** | Se cambia el código a propósito para ver si las pruebas lo detectan. |
| **Next.js** | El framework web con el que está hecha la app (pantallas y API juntas). |
| **ORM** | Herramienta que traduce entre el código y la base de datos. Acá es **Prisma**. |
| **POS** | *Point of Sale*: sistema de punto de venta. |
| **Pull request (PR)** | Pedido en GitHub para mezclar una rama, con revisión y pruebas antes. |
| **Rama** | Una línea de trabajo separada en Git, para hacer cambios sin tocar la versión estable. |
| **Receta** | Cuánto de cada insumo lleva un producto. Define qué se descuenta del stock al cobrar. |
| **Rol** | ADMIN, MOZO o COCINERO: decide qué puede hacer cada persona. |
| **Seed** | Script que llena la base con datos iniciales (`prisma/seed.ts`). |
| **SQLite** | Base de datos que es un solo archivo, sin servidor aparte. |
| **SSE** | *Server-Sent Events*: conexión abierta por la que el servidor avisa cambios al instante. |
| **Standalone** | Modo de compilación de Next.js que genera un servidor autónomo con solo lo necesario. Es lo que va dentro del `.exe`. |
| **Transacción** | Grupo de escrituras que se guarda completo o no se guarda nada. |
| **Turbopack** | El compilador que usa Next.js. |
| **zod** | Librería que valida que los datos recibidos tengan la forma correcta. |

Volver al [índice](README.md).
