import { prisma } from '../src/lib/db';
import { runIndexBatch } from '../src/lib/arcface-batch';
import { getApenadosDir } from '../src/lib/storage';
import { pgvectorAvailable } from '../src/lib/pgvector';
import * as fs from 'fs';
import { join } from 'path';

async function testIndex() {
  console.log('=== DIAGNÓSTICO DE INDEXAÇÃO ARCFACE ===');

  // 1. Verificar conexão e contagens
  try {
    const totalApenados = await prisma.apenado.count();
    const withPhoto = await prisma.apenado.count({ where: { photoPath: { not: null } } });
    const withDescriptor = await prisma.apenado.count({
      where: {
        photoPath: { not: null },
        faceDescriptor: { not: null, notIn: ['NONE'] }
      }
    });
    const withNoneDescriptor = await prisma.apenado.count({
      where: {
        photoPath: { not: null },
        faceDescriptor: 'NONE'
      }
    });
    const withoutDescriptor = await prisma.apenado.count({
      where: {
        photoPath: { not: null },
        faceDescriptor: null
      }
    });

    console.log(`Total de Apenados no Banco: ${totalApenados}`);
    console.log(`Com PhotoPath preenchido: ${withPhoto}`);
    console.log(`Com FaceDescriptor válido: ${withDescriptor}`);
    console.log(`Marcados com FaceDescriptor = NONE (sem rosto detectado): ${withNoneDescriptor}`);
    console.log(`Aguardando indexação (FaceDescriptor = null): ${withoutDescriptor}`);

    // 2. Verificar pgvector
    const pvecAvail = await pgvectorAvailable();
    console.log(`pgvector disponível no banco: ${pvecAvail ? 'SIM' : 'NÃO'}`);

    if (pvecAvail) {
      const withVector = await prisma.$queryRaw<[{ c: bigint }]>`
        SELECT COUNT(*) AS c FROM apenados WHERE "faceVector" IS NOT NULL
      `;
      const withVectorAdvanced = await prisma.$queryRaw<[{ c: bigint }]>`
        SELECT COUNT(*) AS c FROM apenados WHERE "faceVectorAdvanced" IS NOT NULL
      `;
      console.log(`Registros com faceVector (pgvector): ${Number(withVector[0]?.c)}`);
      console.log(`Registros com faceVectorAdvanced (pgvector): ${Number(withVectorAdvanced[0]?.c)}`);

      // Verifica inconsistência: faceDescriptor preenchido mas faceVector nulo
      const inconsistent = await prisma.$queryRaw<[{ c: bigint }]>`
        SELECT COUNT(*) AS c FROM apenados
        WHERE "faceDescriptor" IS NOT NULL
          AND "faceDescriptor" != 'NONE'
          AND "faceVector" IS NULL
      `;
      console.log(`Registros com FaceDescriptor mas sem FaceVector (inconsistentes): ${Number(inconsistent[0]?.c)}`);
    }

    // 3. Testar execução do script Python de indexação ArcFace
    console.log('\n=== TESTANDO SCRIPT ARCFACE COM UMA IMAGEM REAL ===');
    const uploadsDir = getApenadosDir();
    console.log(`Diretório de uploads: ${uploadsDir}`);
    console.log(`Diretório de uploads existe: ${fs.existsSync(uploadsDir) ? 'SIM' : 'NÃO'}`);

    // Pega os arquivos existentes no diretório de uploads e encontra um no banco
    const physicalFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.webp') || f.endsWith('.jpg') || f.endsWith('.png'));
    console.log(`Fotos físicas no diretório (amostra de 5): ${physicalFiles.slice(0, 5).join(', ')}`);

    let sample: any = null;
    let physicalPath = '';

    for (const file of physicalFiles.slice(0, 100)) { // testa até 100 arquivos
      // Busca no banco por photoPath contendo o nome do arquivo
      const base = file.replace(/\.[^/.]+$/, ""); // nome sem extensão
      const apenado = await prisma.apenado.findFirst({
        where: {
          photoPath: { contains: base }
        },
        select: { id: true, photoPath: true }
      });
      if (apenado) {
        sample = apenado;
        physicalPath = join(uploadsDir, file);
        break;
      }
    }

    if (sample) {
      console.log(`Apenado de amostra para teste: ID=${sample.id}, photoPath=${sample.photoPath}`);
      if (physicalPath) {
        console.log(`Arquivo físico encontrado: ${physicalPath}`);
        console.log('Rodando runIndexBatch para este ID...');
        try {
          const result = await runIndexBatch([sample.id], uploadsDir);
          console.log('Resultado da indexação:', JSON.stringify(result, null, 2));
        } catch (e: any) {
          console.error('ERRO na execução do runIndexBatch:', e.message);
        }
      } else {
        console.log(`Arquivo físico para o apenado ${sample.id} NÃO encontrado.`);
      }
    } else {
      console.log('Nenhum apenado correspondente a um arquivo físico foi encontrado no banco.');
    }

    // 4. Testar o carregamento do cache em memória (ignorado no teste rápido de indexação)
    console.log('\n=== CARREGAMENTO DO CACHE EM MEMÓRIA IGNORADO NO TESTE RÁPIDO ===');

  } catch (error: any) {
    console.error('Erro geral durante diagnóstico:', error);
  }
}

testIndex().then(() => prisma.$disconnect());
