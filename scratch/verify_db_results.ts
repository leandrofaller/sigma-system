import { prisma } from '../src/lib/db';

async function main() {
  console.log('=== VERIFICANDO DADOS NO BANCO ===');
  
  const totalVisitantes = await prisma.sipeVisitante.count();
  const totalEntradas = await prisma.sipeVisitanteEntrada.count();
  
  console.log(`Total de Visitantes no DB: ${totalVisitantes}`);
  console.log(`Total de Entradas de Visitas no DB: ${totalEntradas}`);
  
  // Pega uma amostra de 3 visitantes recém-atualizados e indexados
  const visitantes = await prisma.sipeVisitante.findMany({
    where: {
      faceDescriptor: { not: null }
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: 3,
    include: {
      entradas: {
        take: 3
      },
      vinculos: {
        include: {
          apenado: true
        }
      }
    }
  });
  
  for (const v of visitantes) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Visitante: ${v.nome}`);
    console.log(`CPF: ${v.cpf} | Carteirinha: ${v.carteirinha}`);
    console.log(`Pai: ${v.nomePai} | Mãe: ${v.nomeMae}`);
    console.log(`Foto Path: ${v.photoPath}`);
    console.log(`Face Descriptor (Embedding) está presente? ${v.faceDescriptor ? 'SIM (' + v.faceDescriptor.substring(0, 40) + '...)' : 'NÃO'}`);
    console.log(`Det Score: ${v.detScore}`);
    
    console.log(`Vínculos de Apenados (${v.vinculos.length}):`);
    for (const link of v.vinculos) {
      console.log(`  - ${link.apenado.nome} | Ativo: ${link.ativo}`);
    }
    
    console.log(`Entradas de visitas registradas (${v.entradas.length} amostras):`);
    for (const ent of v.entradas) {
      console.log(`  - Tipo: ${ent.tipo} | Apenado: ${ent.nomeApenado} | Unidade: ${ent.unidadePrisional} | Data: ${ent.dataEntrada?.toISOString()}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
