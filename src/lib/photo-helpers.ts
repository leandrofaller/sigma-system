import { prisma } from '@/lib/db';

/**
 * Verifica se um caminho de foto (photoPath) ainda está sendo referenciado
 * em qualquer outra tabela do banco de dados (outro Apenado local,
 * SipeApenadoImportado, SipeFotoComplementar ou AIPApenado).
 * 
 * @param photoPath O caminho relativo da foto (ex: 'uploads/apenados/...')
 * @param ignoreApenadoId Opcional. ID de um Apenado a ser ignorado na busca (geralmente o que está sendo deletado)
 */
export async function isPhotoReferenced(photoPath: string, ignoreApenadoId?: string): Promise<boolean> {
  if (!photoPath) return false;

  // 1. Verifica se a foto está sendo usada por outro registro de Apenado local
  const otherApenado = await prisma.apenado.findFirst({
    where: {
      photoPath,
      ...(ignoreApenadoId ? { id: { not: ignoreApenadoId } } : {}),
    },
    select: { id: true },
  });
  if (otherApenado) return true;

  // 2. Verifica se a foto é usada como principal por algum registro do SIPE/SIAIP
  const sipeImportado = await prisma.sipeApenadoImportado.findFirst({
    where: { photoPath },
    select: { id: true },
  });
  if (sipeImportado) return true;

  // 3. Verifica se a foto é usada como complementar no SIPE/SIAIP
  const sipeFotoComp = await prisma.sipeFotoComplementar.findFirst({
    where: { photoPath },
    select: { id: true },
  });
  if (sipeFotoComp) return true;

  // 4. Verifica se a foto é usada na Inteligência AIP
  const aipApenado = await prisma.aIPApenado.findFirst({
    where: { photoPath },
    select: { id: true },
  });
  if (aipApenado) return true;

  return false;
}
