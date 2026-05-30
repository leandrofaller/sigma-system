import { prisma } from '../src/lib/db';

async function testDeletions() {
  console.log('=== Iniciando Teste de Exclusões Independentes ===');

  try {
    // 1. Limpar dados anteriores de teste se existirem
    console.log('Limpando dados de testes anteriores...');
    await prisma.sipeVinculoAdvogado.deleteMany({ where: { advogado: { sipeId: 99999 } } });
    await prisma.sipeApenadoImportado.deleteMany({ where: { sipeId: 88888 } });
    await prisma.sipeAdvogado.deleteMany({ where: { sipeId: 99999 } });
    await prisma.sipeFaccao.deleteMany({ where: { sipeId: 77777 } });

    // 2. Criar registros de teste vinculados
    console.log('Criando facção de teste...');
    const faccao = await prisma.sipeFaccao.create({
      data: {
        sipeId: 77777,
        nome: 'FACÇÃO TESTE EXCLUSÃO',
        sigla: 'FTE'
      }
    });

    console.log('Criando apenado de teste vinculado à facção...');
    const apenado = await prisma.sipeApenadoImportado.create({
      data: {
        sipeId: 88888,
        nome: 'APENADO TESTE EXCLUSÃO',
        faccaoId: faccao.id
      }
    });

    console.log('Criando advogado de teste...');
    const advogado = await prisma.sipeAdvogado.create({
      data: {
        sipeId: 99999,
        nome: 'ADVOGADO TESTE EXCLUSÃO',
        oab: '99999/RO'
      }
    });

    console.log('Criando vínculo de atendimento entre apenado e advogado...');
    const vinculo = await prisma.sipeVinculoAdvogado.create({
      data: {
        apenadoId: apenado.id,
        advogadoId: advogado.id,
        ativo: true
      }
    });

    console.log('-> Estrutura inicial de teste montada com sucesso!');

    // --- TESTE 1: Excluir apenas a Facção (Deve setar faccaoId do apenado como NULL) ---
    console.log('\n--- TESTE 1: Excluir Facção ---');
    await prisma.sipeFaccao.delete({ where: { id: faccao.id } });
    console.log('Facção excluída com sucesso.');

    const apenadoPosFaccao = await prisma.sipeApenadoImportado.findUnique({
      where: { id: apenado.id }
    });
    console.log('Apenado pós exclusão da facção:');
    console.log(' - Existe?', !!apenadoPosFaccao);
    console.log(' - faccaoId (esperado: null):', apenadoPosFaccao?.faccaoId);

    if (apenadoPosFaccao && apenadoPosFaccao.faccaoId === null) {
      console.log('✅ TESTE 1 APROVADO: A facção foi deletada de forma independente e o apenado manteve-se intacto com faccaoId = null.');
    } else {
      throw new Error('TESTE 1 FALHOU: O apenado foi removido ou manteve o faccaoId.');
    }

    // --- TESTE 2: Excluir apenas o Advogado (Deve apagar o vínculo em cascata e manter o apenado) ---
    console.log('\n--- TESTE 2: Excluir Advogado ---');
    // Simula a transação da API para deletar advogado
    await prisma.$transaction([
      prisma.sipeVinculoAdvogado.deleteMany({ where: { advogadoId: advogado.id } }),
      prisma.sipeAdvogado.delete({ where: { id: advogado.id } })
    ]);
    console.log('Advogado e vínculos deletados com sucesso.');

    const apenadoPosAdvogado = await prisma.sipeApenadoImportado.findUnique({
      where: { id: apenado.id }
    });
    const vinculoPosAdvogado = await prisma.sipeVinculoAdvogado.findFirst({
      where: { apenadoId: apenado.id, advogadoId: advogado.id }
    });

    console.log('Resultado pós exclusão do advogado:');
    console.log(' - Apenado continua existindo?', !!apenadoPosAdvogado);
    console.log(' - Vínculo de atendimento foi excluído? (esperado: true):', !vinculoPosAdvogado);

    if (apenadoPosAdvogado && !vinculoPosAdvogado) {
      console.log('✅ TESTE 2 APROVADO: O advogado foi deletado de forma independente, os vínculos foram excluídos e o apenado manteve-se íntegro.');
    } else {
      throw new Error('TESTE 2 FALHOU: O apenado foi deletado ou o vínculo permaneceu.');
    }

    // --- TESTE 3: Excluir apenas o Apenado (Deve apagar os seus dependentes em cascata) ---
    console.log('\n--- TESTE 3: Excluir Apenado ---');
    // Criamos um novo vínculo e processo rápidos para testar a cascata
    const outroAdvogado = await prisma.sipeAdvogado.create({
      data: { sipeId: 99999, nome: 'OUTRO ADV TESTE', oab: '99998/RO' }
    });
    await prisma.sipeVinculoAdvogado.create({
      data: { apenadoId: apenado.id, advogadoId: outroAdvogado.id, ativo: true }
    });
    const processo = await prisma.sipeProcesso.create({
      data: { apenadoId: apenado.id, numero: '0000000-00.0000.0.00.0000' }
    });

    console.log('Simulando transação da API para deletar apenado...');
    await prisma.$transaction([
      prisma.sipeVinculoVisitante.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeVinculoAdvogado.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeProcesso.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeAlcunha.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeHistorico.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeDocumento.deleteMany({ where: { apenadoId: apenado.id } }),
      prisma.sipeApenadoImportado.delete({ where: { id: apenado.id } })
    ]);
    console.log('Apenado e dependentes deletados com sucesso.');

    const apenadoFinal = await prisma.sipeApenadoImportado.findUnique({
      where: { id: apenado.id }
    });
    const processoFinal = await prisma.sipeProcesso.findUnique({
      where: { id: processo.id }
    });
    const advFinal = await prisma.sipeAdvogado.findUnique({
      where: { id: outroAdvogado.id }
    });

    console.log('Resultado pós exclusão do apenado:');
    console.log(' - Apenado foi excluído?', !apenadoFinal);
    console.log(' - Processo associado foi excluído? (esperado: true):', !processoFinal);
    console.log(' - O advogado associado continua existindo? (esperado: true):', !!advFinal);

    if (!apenadoFinal && !processoFinal && advFinal) {
      console.log('✅ TESTE 3 APROVADO: O apenado e seus dependentes foram deletados em cascata de forma independente, sem afetar o cadastro do advogado.');
    } else {
      throw new Error('TESTE 3 FALHOU: O apenado/processo permaneceu ou o advogado foi indevidamente removido.');
    }

    // Limpeza final do outro advogado
    await prisma.sipeAdvogado.delete({ where: { id: outroAdvogado.id } });

    console.log('\n=== ✅ TODOS OS TESTES DE INTEGRIDADE REFERENCIAL PASSARAM! ===');

  } catch (err) {
    console.error('\n❌ Ocorreu um erro durante os testes:', err);
  }
}

testDeletions();
