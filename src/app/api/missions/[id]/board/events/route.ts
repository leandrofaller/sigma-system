import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { canAccessMissionBoard } from '@/lib/board-auth';
import { subscribe, publish } from '@/lib/board-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // SSE não funciona bem em edge

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const user = session.user as any;
  const { id } = await params;

  const access = await canAccessMissionBoard(id, user);
  if (!access.ok) return new Response(access.error, { status: access.status });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      // evento inicial: confirma conexão
      send(`event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);

      // anuncia presença
      publish({
        type: 'presence',
        missionId: id,
        actorId: user.id,
        payload: { userId: user.id, userName: user.name, online: true },
      });

      unsubscribe = subscribe(id, (event) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // heartbeat a cada 25s pra manter conexão viva (proxies fecham conexões idle)
      heartbeat = setInterval(() => send(`: ping\n\n`), 25000);

      // cleanup quando o cliente desconecta
      req.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        publish({
          type: 'presence',
          missionId: id,
          actorId: user.id,
          payload: { userId: user.id, userName: user.name, online: false },
        });
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // desabilita buffering em nginx/Coolify
    },
  });
}
