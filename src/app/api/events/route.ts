import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAuth, sesionVigente } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/session';
import eventEmitter from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  // Se guarda el token para revalidarlo durante la conexión (ver el heartbeat).
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  // Libera TODO lo que la conexión dejó abierto. Es idempotente: se puede llamar varias veces.
  const limpiar = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      // Listen for all events
      unsubscribe = eventEmitter.on('*', (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          limpiar(); // el stream ya está cerrado
        }
      });

      // Heartbeat cada 30 s. También revalida la sesión: una conexión abierta no debe seguir recibiendo eventos
      // si la sesión venció o el usuario fue desactivado. En ese caso avisa ("sesion-vencida") y cierra.
      heartbeat = setInterval(async () => {
        try {
          if (!(await sesionVigente(token))) {
            controller.enqueue(encoder.encode('data: {"type":"sesion-vencida"}\n\n'));
            limpiar();
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode('data: {"type":"heartbeat"}\n\n'));
        } catch {
          limpiar();
        }
      }, 30000);

      // El cliente cerró la pestaña o perdió la conexión.
      request.signal.addEventListener('abort', () => {
        limpiar();
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
    },
    cancel() {
      limpiar();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
