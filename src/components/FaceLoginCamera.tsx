'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type FaceState =
  | 'loading_models'
  | 'requesting_camera'
  | 'no_face'
  | 'face_detected'
  | 'capturing'
  | 'done'
  | 'error';

interface FaceLoginCameraProps {
  onDescriptor: (descriptor: number[], image?: string) => void;
  active: boolean;
}

// Cache global dos modelos — carrega apenas uma vez por sessão
let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;

// CDN do vladmandic/face-api — funciona sem precisar deployar arquivos locais
const CDN_MODEL_URL =
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';
const LOCAL_MODEL_URL = '/models';

async function loadModelsFromUrl(faceapi: any, url: string): Promise<void> {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(url),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
    faceapi.nets.faceRecognitionNet.loadFromUri(url),
  ]);
}

async function ensureModelsLoaded(faceapi: any): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      // Tenta arquivos locais primeiro (mais rápido quando disponíveis)
      await loadModelsFromUrl(faceapi, LOCAL_MODEL_URL);
    } catch {
      // Fallback para CDN (funciona sempre, inclusive em produção)
      await loadModelsFromUrl(faceapi, CDN_MODEL_URL);
    }
    modelsLoaded = true;
  })();

  return modelsLoading;
}


export function FaceLoginCamera({ onDescriptor, active }: FaceLoginCameraProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceApiRef  = useRef<any>(null);
  const capturedRef = useRef(false); // evita dupla captura

  const [state, setState]       = useState<FaceState>('loading_models');
  const [retryKey, setRetryKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Para câmera e loop de detecção ───────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Inicializa câmera e modelos ───────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    capturedRef.current = false;

    async function init() {
      try {
        setState('loading_models');
        setErrorMsg('');

        // Import dinâmico (client-only)
        const faceapi = await import('@vladmandic/face-api');
        faceApiRef.current = faceapi;

        await ensureModelsLoaded(faceapi);
        if (cancelled) return;

        setState('requesting_camera');

        // ── Constraints compatíveis com iOS Safari ───────────────────────
        // iOS exige `ideal:` para width/height; sem isso lança
        // "The string did not match the expected pattern"
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'user' },
              width:  { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
        } catch {
          // Fallback mínimo — funciona em qualquer browser/dispositivo
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;

          // Aguarda metadados para saber as dimensões reais do vídeo
          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => resolve();
          });

          // Ajusta canvas às dimensões reais do stream
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width  = video.videoWidth  || 640;
            canvas.height = video.videoHeight || 480;
          }

          await video.play();
        }

        if (cancelled) return;

        setState('no_face');
        startDetection(faceapi);
      } catch (err: any) {
        if (cancelled) return;

        const name = err?.name ?? '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMsg('Permissão de câmera negada. Habilite nas configurações do navegador.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMsg('Nenhuma câmera encontrada neste dispositivo.');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setErrorMsg('A câmera está em uso por outro aplicativo.');
        } else {
          // Exibe a mensagem real do erro para diagnóstico
          setErrorMsg(err?.message || 'Erro desconhecido ao inicializar a câmera.');
        }
        setState('error');
      }
    }

    init();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [active, retryKey, stopCamera]); // retryKey força reinício no retry

  // ── Loop de detecção facial ───────────────────────────────────────────────
  function startDetection(faceapi: any) {
    intervalRef.current = setInterval(async () => {
      if (capturedRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused) return;

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,       // menor = mais rápido em mobile
            scoreThreshold: 0.5,
          }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        if (!detection) {
          setState('no_face');
          drawOverlay(null);
          return;
        }

        const score = detection.detection.score;
        drawOverlay(detection.detection.box);

        if (score >= 0.75) {
          setState('face_detected');

          // Aguarda estabilização
          await new Promise((r) => setTimeout(r, 700));
          if (capturedRef.current) return;

          // Segunda leitura para descriptor final
          const final = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
              inputSize: 320,
              scoreThreshold: 0.65,
            }))
            .withFaceLandmarks(true)
            .withFaceDescriptor();

          if (final && final.detection.score >= 0.65 && !capturedRef.current) {
            capturedRef.current = true;
            if (intervalRef.current) clearInterval(intervalRef.current);
            stopCamera();
            setState('done');

            let base64Image = '';
            try {
              const video = videoRef.current;
              if (video) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = video.videoWidth || 640;
                tempCanvas.height = video.videoHeight || 480;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                  // Espelha horizontalmente para corresponder à visualização do usuário
                  tempCtx.translate(tempCanvas.width, 0);
                  tempCtx.scale(-1, 1);
                  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                  base64Image = tempCanvas.toDataURL('image/jpeg', 0.8);
                }
              }
            } catch (err) {
              console.error('[FaceLoginCamera] Erro ao obter screenshot em base64:', err);
            }

            onDescriptor(Array.from(final.descriptor), base64Image);
          }
        } else {
          setState('no_face');
        }
      } catch {
        // Ignora erros de detecção individuais (frame ruim, video pausado etc.)
      }
    }, 350);
  }

  // ── Overlay no canvas ─────────────────────────────────────────────────────
  function drawOverlay(box: any) {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!box) return;

    // Escala em relação ao tamanho atual do canvas (dinâmico)
    const scaleX = canvas.width  / (video.videoWidth  || canvas.width);
    const scaleY = canvas.height / (video.videoHeight || canvas.height);

    const x = box.x * scaleX;
    const y = box.y * scaleY;
    const w = box.width  * scaleX;
    const h = box.height * scaleY;

    const isGood = state === 'face_detected';
    ctx.strokeStyle = isGood ? '#22c55e' : '#f97316';
    ctx.lineWidth   = 2.5;
    ctx.shadowBlur  = isGood ? 14 : 6;
    ctx.shadowColor = ctx.strokeStyle;

    // Marcadores de canto estilo biométrico
    const corner = Math.min(w, h) * 0.22;
    ctx.beginPath();
    ctx.moveTo(x + corner, y);       ctx.lineTo(x, y);           ctx.lineTo(x, y + corner);
    ctx.moveTo(x + w - corner, y);   ctx.lineTo(x + w, y);       ctx.lineTo(x + w, y + corner);
    ctx.moveTo(x, y + h - corner);   ctx.lineTo(x, y + h);       ctx.lineTo(x + corner, y + h);
    ctx.moveTo(x + w, y + h - corner); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - corner, y + h);
    ctx.stroke();
  }

  if (!active) return null;

  // ── Mensagens de estado ───────────────────────────────────────────────────
  const stateMessages: Record<FaceState, string> = {
    loading_models:    'Carregando modelos de IA...',
    requesting_camera: 'Aguardando permissão da câmera...',
    no_face:           'Posicione seu rosto na câmera',
    face_detected:     'Rosto detectado! Aguarde...',
    capturing:         'Capturando...',
    done:              '✓ Rosto reconhecido!',
    error:             errorMsg || 'Erro na câmera',
  };

  const borderColor =
    state === 'face_detected' || state === 'done' ? 'rgba(34,197,94,0.5)'
    : state === 'error'                           ? 'rgba(239,68,68,0.4)'
    :                                               'rgba(249,115,22,0.3)';

  const statusBg =
    state === 'face_detected' || state === 'done' ? 'rgba(34,197,94,0.12)'
    : state === 'error'                           ? 'rgba(239,68,68,0.12)'
    :                                               'rgba(249,115,22,0.12)';

  const statusColor =
    state === 'face_detected' || state === 'done' ? '#22c55e'
    : state === 'error'                           ? '#ef4444'
    :                                               '#f97316';

  const showOverlay = state === 'loading_models' || state === 'requesting_camera' || state === 'error';

  return (
    <div className="space-y-3">
      {/* Viewport câmera */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: '#111',
          border: `2px solid ${borderColor}`,
          transition: 'border-color 0.3s ease',
          aspectRatio: '4/3',
          maxHeight: '260px',
        }}
      >
        {/* Vídeo ao vivo — sempre presente no DOM para receber srcObject */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            display: showOverlay ? 'none' : 'block',
          }}
        />

        {/* Canvas do overlay de bounding-box */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            transform: 'scaleX(-1)',
            pointerEvents: 'none',
          }}
        />

        {/* Overlay de loading / erro */}
        {showOverlay && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center"
            style={{ background: 'rgba(0,0,0,0.88)' }}
          >
            {state !== 'error' ? (
              <svg className="animate-spin w-8 h-8 text-orange-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-9 h-9 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
            <p className="text-sm text-gray-300 leading-snug max-w-xs">{stateMessages[state]}</p>
            {state === 'error' && (
              <button
                type="button"
                onClick={() => { modelsLoaded = false; modelsLoading = null; setState('loading_models'); setRetryKey((k) => k + 1); }}
                className="mt-1 text-xs text-orange-400 underline hover:text-orange-300"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {/* Overlay de sucesso */}
        {state === 'done' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.2)', border: '2px solid #22c55e' }}
            >
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 text-sm font-medium">Autenticando...</p>
          </div>
        )}
      </div>

      {/* Barra de status */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all duration-300"
        style={{
          background: statusBg,
          border: `1px solid ${statusColor}40`,
          color: statusColor,
        }}
      >
        {(state === 'face_detected' || state === 'done') ? (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : state === 'error' ? (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
        <span className="leading-tight">{stateMessages[state]}</span>
      </div>
    </div>
  );
}
