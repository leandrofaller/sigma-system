import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/sipe/sync/stream?jobId=...
 *
 * Endpoint SSE (Server-Sent Events) para streaming de logs de sincronização
 * Mostra o status em tempo real
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId é obrigatório' }, { status: 400 })
  }

  // Verificar se o job existe
  const job = await prisma.sipeSyncJob.findUnique({
    where: { id: jobId },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  }

  const encoder = new TextEncoder()

  let pollInterval: NodeJS.Timeout | null = null
  let isClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const safeClose = () => {
        if (isClosed) return
        isClosed = true
        if (pollInterval) {
          clearInterval(pollInterval)
        }
        try {
          controller.close()
        } catch (e) {
          // Ignora erros se já estiver fechado
        }
      }

      const safeEnqueue = (data: Uint8Array) => {
        if (isClosed) return
        try {
          controller.enqueue(data)
        } catch (e) {
          // Ignora e fecha se der erro no controller
          safeClose()
        }
      }

      try {
        // Enviar job inicial
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'job-status',
              jobId: job.id,
              status: job.status,
              tipo: job.tipo,
              unidade: job.unidadeNome,
              total: job.total,
              processado: job.processado,
              erros: job.erros,
              fase: job.fase,
              log: job.log,
            })}\n\n`
          )
        )

        let ultimoLog = job.log || ''
        let ultimoStatus = job.status

        pollInterval = setInterval(async () => {
          try {
            if (isClosed) {
              if (pollInterval) clearInterval(pollInterval)
              return
            }

            const updated = await prisma.sipeSyncJob.findUnique({
              where: { id: jobId },
            })

            if (!updated) {
              safeClose()
              return
            }

            // Enviar novo log se mudou
            if ((updated.log ?? '') !== ultimoLog) {
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'log',
                    message: updated.log,
                  })}\n\n`
                )
              )
              ultimoLog = updated.log ?? ''
            }

            // Enviar atualização de status
            if (updated.status !== ultimoStatus) {
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'progress',
                    status: updated.status,
                    processado: updated.processado,
                    erros: updated.erros,
                  })}\n\n`
                )
              )
              ultimoStatus = updated.status
            }

            // Se completo, fechar stream e limpar intervalo
            if (
              updated.status === 'COMPLETED' ||
              updated.status === 'FAILED' ||
              updated.status === 'INTERRUPTED'
            ) {
              safeClose()
            }
          } catch (err) {
            safeClose()
          }
        }, 500)

        setTimeout(() => {
          safeClose()
        }, 30 * 60 * 1000)
      } catch (err) {
        safeClose()
      }
    },
    cancel() {
      // Disparado se o cliente fechar a aba ou abortar a conexão SSE
      isClosed = true
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
