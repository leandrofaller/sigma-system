const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function requestSipeViaProxy(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
  const res = await fetch(url)
  return res.status
}

async function main() {
  const sipeId = 31417
  const pathsToTest = [
    `/relatorios/mudarcela`,
    `/relatorios/historicoMudarCela`,
    `/relatorios/mudancacela`,
    `/relatorios/historicoMudancaCela`,
    `/apenados/${sipeId}/mudarcela/historico`,
    `/apenados/${sipeId}/historicoMudarCela`,
    `/apenados/${sipeId}/historicoMudancaCelas`,
    `/apenados/${sipeId}/mudancaCelas`,
    `/apenados/${sipeId}/historicoCela`,
    `/apenados/mudarcela/historico`,
    `/apenados/historicoMudarCela`,
    `/apenados/${sipeId}/mudarcela/imprimir`,
    `/apenados/${sipeId}/mudarcela/print`,
    `/apenados/${sipeId}/imprimirMudarcela`
  ]

  console.log(`Testando URLs alternativas para mudarcela para o apenado ${sipeId}...`)
  for (const path of pathsToTest) {
    try {
      const status = await requestSipeViaProxy(path)
      console.log(`Path: ${path} -> Status: ${status}`)
    } catch (err: any) {
      console.log(`Path: ${path} -> Erro: ${err.message}`)
    }
  }
}

main()
