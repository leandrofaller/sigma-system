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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Enviar job inicial
        controller.enqueue(
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

        const pollInterval = setInterval(async () => {
          try {
            const updated = await prisma.sipeSyncJob.findUnique({
              where: { id: jobId },
            })

            if (!updated) {
              clearInterval(pollInterval)
              controller.close()
              return
            }

            // Enviar novo log se mudou
            if (updated.log !== ultimoLog) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'log',
                    message: updated.log,
                  })}\n\n`
                )
              )
              ultimoLog = updated.log
            }

            // Enviar atualização de status
            if (updated.status !== ultimoStatus) {
              controller.enqueue(
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

            // Se completo, fechar stream
            if (
              updated.status === 'COMPLETED' ||
              updated.status === 'FAILED' ||
              updated.status === 'INTERRUPTED'
            ) {
              controller.close()
            }
          } catch (err) {
            clearInterval(pollInterval)
            controller.close()
          }
        }, 500)

        setTimeout(() => {
          clearInterval(pollInterval)
          controller.close()
        }, 30 * 60 * 1000)
      } catch (err) {
        controller.close()
      }
    },
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
