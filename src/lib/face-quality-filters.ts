import { Prisma } from '@prisma/client';

/** Registros classificados pelo pipeline photo_classifier.py */
export const CLASSIFIED_SQL = `"photoClassifiedAt" IS NOT NULL AND "photoCategory" IS NOT NULL`;

/** Falsos negativos: indexador marcou NONE mas classificador achou rosto */
export const faceMissedFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND (
    (${CLASSIFIED_SQL} AND "photoCategory" IN ('FACE_OK', 'FACE_MISSED'))
  )
`;

export const docFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND (
    (${CLASSIFIED_SQL} AND "photoCategory" = 'DOCUMENT')
    OR (
      "photoClassifiedAt" IS NULL AND (
        ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria|cnh|passaporte|documento|matricula|filiação|ministério|república')
        OR "photoPath" ~* 'doc|rg|cpf|documento|certid|identidade'
        OR "photoQuality" < 5
        OR "photoHash" IN (
          SELECT "photoHash" FROM apenados
          WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
          GROUP BY "photoHash"
          HAVING COUNT(*) >= 5
        )
      )
    )
  )
`;

export const tattooFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND NOT (
    (${CLASSIFIED_SQL} AND "photoCategory" IN ('FACE_OK', 'FACE_MISSED'))
  ) AND (
    (${CLASSIFIED_SQL} AND "photoCategory" IN ('TATTOO', 'BODY'))
    OR (
      "photoClassifiedAt" IS NULL AND NOT (
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
        "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz|scar'
        OR EXISTS (
          SELECT 1 FROM sipe_fotos_complementares fc
          WHERE fc."apenadoLocalId" = apenados.id
            AND fc.descricao IS NOT NULL
            AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz|scar'
        )
      )
    )
  )
`;

export const otherNoFaceFilterSql = `
  "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL
  AND NOT ((${CLASSIFIED_SQL} AND "photoCategory" IN ('FACE_OK', 'FACE_MISSED', 'DOCUMENT', 'TATTOO', 'BODY')))
  AND NOT (
    "photoClassifiedAt" IS NULL AND (
      ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
      OR "photoPath" ~* 'doc|rg|cpf|documento'
      OR "photoQuality" < 5
    )
  )
  AND NOT (
    "photoClassifiedAt" IS NULL AND (
      "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz|scar'
      OR EXISTS (
        SELECT 1 FROM sipe_fotos_complementares fc
        WHERE fc."apenadoLocalId" = apenados.id
          AND fc.descricao IS NOT NULL
          AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz|scar'
      )
    )
  )
`;

export type QualityTab =
  | 'lowscore'
  | 'blurry'
  | 'pending'
  | 'noface_doc'
  | 'noface_tattoo'
  | 'noface'
  | 'face_missed';

export function getPrismaWhereForTab(tab: string): Prisma.ApenadoWhereInput {
  switch (tab) {
    case 'lowscore':
      return { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } };
    case 'blurry':
      return { faceDescriptor: { startsWith: '[' }, photoQuality: { lt: 50 } };
    case 'pending':
      return { faceDescriptor: null, photoPath: { not: null } };
    case 'face_missed':
      return {
        faceDescriptor: 'NONE',
        photoPath: { not: null },
        photoCategory: { in: ['FACE_OK', 'FACE_MISSED'] },
        photoClassifiedAt: { not: null },
      };
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
    case 'face_missed':
      return faceMissedFilterSql;
    default:
      return '';
  }
}

export function isNoFaceDeletionTab(tab: string): boolean {
  return tab === 'noface' || tab === 'noface_doc' || tab === 'noface_tattoo';
}