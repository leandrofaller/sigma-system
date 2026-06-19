import { prisma } from '../src/lib/db';

async function inspectTattoos() {
  console.log('=== INSPEÇÃO DE FOTOS COMPLEMENTARES ===');
  try {
    // Busca nas observações (notes) de quem tem faceDescriptor = 'NONE'
    console.log('\n=== BUSCANDO TATUAGENS NAS OBSERVAÇÕES (NOTES) ===');
    const noteSamples = await prisma.apenado.findMany({
      where: {
        faceDescriptor: 'NONE',
        notes: {
          contains: 'tatuagem',
          mode: 'insensitive'
        }
      },
      take: 10,
      select: { id: true, name: true, notes: true, photoPath: true }
    });
    console.log('Amostra de apenados com "tatuagem" nas observações:', JSON.stringify(noteSamples, null, 2));

    const totalNotes = await prisma.apenado.count({
      where: {
        faceDescriptor: 'NONE',
        notes: {
          contains: 'tatuagem',
          mode: 'insensitive'
        }
      }
    });
    console.log(`Total de registros sem rosto com "tatuagem" nas observações: ${totalNotes}`);

    // Busca nas observações por "tattoo"
    const totalTattoo = await prisma.apenado.count({
      where: {
        faceDescriptor: 'NONE',
        notes: {
          contains: 'tattoo',
          mode: 'insensitive'
        }
      }
    });
    console.log(`Total de registros sem rosto com "tattoo" nas observações: ${totalTattoo}`);
  } catch (err: any) {
    console.error('Erro na inspeção:', err.message);
  }
}

inspectTattoos().then(() => prisma.$disconnect());
