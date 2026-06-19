import { Prisma } from '@prisma/client';

export const docFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND (
    ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
    OR "photoPath" ~* 'doc|rg|cpf|documento'
    OR "photoQuality" < 5
    OR "photoHash" IN (
      SELECT "photoHash" FROM apenados
      WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
      GROUP BY "photoHash"
      HAVING COUNT(*) >= 5
    )
  )
`;

export const tattooFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND NOT (
    ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
    OR "photoPath" ~* 'doc|rg|cpf|documento'
    OR "photoQuality" < 5
    OR "photoHash" IN (
      SELECT "photoHash" FROM apenados
      WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
      GROUP BY "photoHash"
      HAVING COUNT(*) >= 5
    )
  ) AND (
    "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag'
    OR EXISTS (
      SELECT 1 FROM sipe_fotos_complementares fc
      WHERE fc."apenadoLocalId" = apenados.id
        AND fc.descricao IS NOT NULL
        AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz'
    )
  )
`;

export const otherNoFaceFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL
  AND NOT (
    ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
    OR "photoPath" ~* 'doc|rg|cpf|documento'
    OR "photoQuality" < 5
    OR "photoHash" IN (
      SELECT "photoHash" FROM apenados
      WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
      GROUP BY "photoHash"
      HAVING COUNT(*) >= 5
    )
  )
  AND NOT (
    "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag'
    OR EXISTS (
      SELECT 1 FROM sipe_fotos_complementares fc
      WHERE fc."apenadoLocalId" = apenados.id
        AND fc.descricao IS NOT NULL
        AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz'
    )
  )
`;

export function getPrismaWhereForTab(tab: string): Prisma.ApenadoWhereInput {
  switch (tab) {
    case 'lowscore':
      return { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } };
    case 'blurry':
      return { faceDescriptor: { startsWith: '[' }, photoQuality: { lt: 50 } };
    case 'pending':
      return { faceDescriptor: null, photoPath: { not: null } };
    default:
      return {};
  }
}

export function getSqlFilterForTab(tab: string): string {
  switch (tab) {
    case 'noface_doc':
      return docFilterSql;
    case 'noface_tattoo':
      return tattooFilterSql;
    case 'noface':
      return otherNoFaceFilterSql;
    default:
      return '';
  }
}
