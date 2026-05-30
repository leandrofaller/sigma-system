import { startUnifiedDupJob, getUnifiedDupState } from '../src/lib/unified-duplicate-job'

async function main() {
  console.log('🚀 Iniciando o Job de Duplicatas unificado...')
  const started = startUnifiedDupJob()
  if (!started) {
    console.error('❌ Não foi possível iniciar o job (provavelmente já está rodando)')
    return
  }

  console.log('⏳ Job iniciado com sucesso. Monitorando o estado...')
  
  while (true) {
    const state = getUnifiedDupState()
    console.log(`[STATE] Phase: ${state.phase} | Indexing: ${state.indexingCurrent}/${state.indexingTotal} | Groups: ${state.totalGroups} | Analyzed: ${state.totalAnalyzed} | Error: "${state.error || 'Nenhum'}"`)
    
    if (state.phase === 'done') {
      console.log('✅ Job finalizado com sucesso!')
      console.log(`Grupos Encontrados: ${state.totalGroups}`)
      console.log(`Grupos do tipo Face (ArcFace): ${state.faceGroupsCount}`)
      
      for (const group of state.groups) {
        console.log(`\nGrupo [Tipo: ${group.type}]`)
        for (const record of group.records) {
          console.log(`  - Apenado: ${record.name} | ID: ${record.id} | Tem Face: ${record.hasFace} | Qualidade: ${record.photoQuality}`)
        }
      }
      break
    }
    
    if (state.phase === 'idle' && state.error) {
      console.error(`❌ Job falhou com erro: ${state.error}`)
      break
    }
    
    // Aguarda 1 segundo antes de checar novamente
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

main().catch(console.error)
