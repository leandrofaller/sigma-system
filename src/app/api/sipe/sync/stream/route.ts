/**
 * SSE endpoint for real-time SIPE sync progress.
 * Streams in-memory state every 600ms; falls back to DB if no active job in memory.
 * Client closes the connection when status is COMPLETED/FAILED/INTERRUPTED.
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getSipeState } from '@/lib/sipe-scraper'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Não autorizado', { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (payload: object) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          )
        } catch {
          closed = true
        }
      }

      // Keep-alive comment every 25s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        if (closed) { clearInterval(keepAlive); return }
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')) } catch { closed = true }
      }, 25_000)

      const poll = async () => {
        if (closed) return

        // Prefer in-memory state (zero DB overhead)
        const mem = getSipeState()
        if (mem && (!jobId || mem.jobId === jobId)) {
          send(mem)
          if (mem.status !== 'RUNNING') {
            clearInterval(keepAlive)
            try { controller.close() } catch { /* already closed */ }
            closed = true
            return
          }
        } else if (jobId) {
          // Fall back to DB for historical / non-active jobs
          const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
          if (job) {
            send(job)
            if (job.status !== 'RUNNING' && job.status !== 'PENDING') {
              clearInterval(keepAlive)
              try { controller.close() } catch { /* already closed */ }
              closed = true
              return
            }
          }
        }

        if (!closed) setTimeout(poll, 600)
      }

      await poll()

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(keepAlive)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  })
}
