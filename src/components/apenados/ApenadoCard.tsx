'use client';

import { Download, Pencil, Trash2, User } from 'lucide-react';

export interface Apenado {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao?: string | null;
  photoPath: string | null;
  notes?: string | null;
  createdAt: Date | string;
  photoQuality?: number | null;
  _photoTs?: number;
  isFaceIndexed?: boolean;
  noFaceDetected?: boolean;
  isLinkedToSipe?: boolean;
}

function qualityPill(q: number | null | undefined) {
  if (q === null || q === undefined) return null;
  if (q < 50) return { label: 'Borrada', cls: 'bg-red-500/80 text-white' };
  if (q < 150) return { label: 'Regular', cls: 'bg-yellow-500/80 text-white' };
  if (q < 400) return { label: 'Boa', cls: 'bg-blue-500/80 text-white' };
  return { label: 'Nítida', cls: 'bg-green-500/80 text-white' };
}

function faceStatusPill(a: Apenado) {
  if (!a.photoPath) return null;
  if (a.isFaceIndexed) {
    return { label: 'Facial ativo', cls: 'bg-green-600/90 text-white' };
  }
  if (a.noFaceDetected) {
    return { label: 'Sem rosto', cls: 'bg-red-600/90 text-white' };
  }
  return { label: 'Não indexada', cls: 'bg-yellow-600/90 text-white shadow-sm' };
}

interface Props {
  apenado: Apenado;
  userRole: string;
  onEdit: (a: Apenado) => void;
  onDelete: (id: string) => void;
  onPhotoClick?: (a: Apenado) => void;
}

export function ApenadoCard({ apenado, userRole, onEdit, onDelete, onPhotoClick }: Props) {
  const canDelete = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const photoUrl = apenado.photoPath
    ? `/api/apenados/${apenado.id}/foto${apenado._photoTs ? `?t=${apenado._photoTs}` : ''}`
    : null;
  const initial = apenado.name.charAt(0).toUpperCase();

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/apenados/${apenado.id}/foto?download=1`;
    a.download = `${apenado.name}${apenado.matricula ? '_' + apenado.matricula : ''}.jpg`;
    a.click();
  };

  return (
    <div className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-sigma-500/10 hover:-translate-y-0.5">
      {/* Photo area */}
      <div
        className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
        onClick={() => onPhotoClick?.(apenado)}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={apenado.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}

        {/* Fallback placeholder */}
        <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sigma-400 via-sigma-600 to-sigma-800 ${photoUrl ? 'hidden' : ''}`}>
          <span className="text-white font-bold select-none" style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)' }}>
            {initial}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 gap-1.5">
          {photoUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/20 backdrop-blur-sm hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors w-full justify-center"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Foto
            </button>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(apenado); }}
              className="flex-1 flex items-center gap-1 justify-center text-xs font-semibold text-white bg-sigma-600/80 hover:bg-sigma-600 backdrop-blur-sm px-2 py-1.5 rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(apenado.id); }}
                className="flex items-center gap-1 justify-center text-xs font-semibold text-white bg-red-600/80 hover:bg-red-600 backdrop-blur-sm px-2 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {apenado.isLinkedToSipe && (
          <div className="absolute top-2 right-2 z-10">
            <div className="flex items-center gap-1 bg-purple-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm" title="Vinculado à ficha do SIPE (Apenados & Facções)">
              <span className="w-1.2 h-1.2 bg-green-400 rounded-full animate-pulse" />
              SIPE VINCULADO
            </div>
          </div>
        )}

        {!apenado.photoPath && !apenado.isLinkedToSipe && (
          <div className="absolute top-2 right-2">
            <div className="w-5 h-5 bg-gray-400/80 rounded-full flex items-center justify-center">
              <User className="w-3 h-3 text-white" />
            </div>
          </div>
        )}
        {apenado.photoPath && (() => { const p = qualityPill(apenado.photoQuality); return p ? (
          <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none pointer-events-none select-none ${p.cls}`}>
            {p.label}
          </div>
        ) : null; })()}
        {apenado.photoPath && (() => { const p = faceStatusPill(apenado); return p ? (
          <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none pointer-events-none select-none z-10 ${p.cls}`}>
            {p.label}
          </div>
        ) : null; })()}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs font-bold text-title leading-tight truncate">{apenado.name}</p>
        {apenado.matricula && (
          <p className="text-[10px] text-subtle mt-0.5 font-mono">{apenado.matricula}</p>
        )}
        {apenado.unidade && (
          <p className="text-[10px] text-body mt-0.5 truncate">{apenado.unidade}</p>
        )}
      </div>
    </div>
  );
}
