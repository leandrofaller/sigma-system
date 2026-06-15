'use client'

import { AdvogadosImportados } from './AdvogadosImportados'

export function AIPAdvogadosPanel() {
  return (
    <AdvogadosImportados
      apiEndpoint="/api/aip/advogados"
      apiApenadoDetailPrefix="/api/sipe/apenados"
      apiPhotoPrefix="/api/sipe/apenados"
      apiUnidadesLookup="/api/sipe/unidades"
      apiFaccoesLookup="/api/aip/faccoes"
      hideSyncCna={true}
    />
  )
}
