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
  onDescriptor: (descriptor: number[]) => void;
  active: boolean;
}

export function FaceLoginCamera({ onDescriptor, active }: FaceLoginCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceApiRef = useRef<any>(null);

  const [state, setState] = useState<FaceState>('loading_models');
  const [errorMsg, setErrorMsg] = useState('');
  const [confidence, setConfidence] = useState(0);

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

  // Carrega face-api e modelos
  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function init() {
      try {
        setState('loading_models');

        // Carrega face-api dinamicamente (client-only)
        const faceapi = await import('@vladmandic/face-api');
        faceApiRef.current = faceapi;

        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (cancelled) return;

        setState('requesting_camera');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setState('no_face');
        startDetection(faceapi);
      } catch (err: any) {
        if (!cancelled) {
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            setErrorMsg('Permissão de câmera negada. Habilite nas configurações do navegador.');
          } else {
            setErrorMsg(err?.message ?? 'Erro ao inicializar a câmera.');
          }
          setState('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [active, stopCamera]);

  function startDetection(faceapi: any) {
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        setState('no_face');
        setConfidence(0);
        drawOverlay(null);
        return;
      }

      const score = detection.detection.score;
      setConfidence(score);
      drawOverlay(detection.detection.box);

      if (score >= 0.80) {
        setState('face_detected');

        // Aguarda 1s estável antes de capturar
        await new Promise((r) => setTimeout(r, 800));

        // Redetecta para pegar o descriptor mais recente
        const final = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.7 }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        if (final && final.detection.score >= 0.75) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          stopCamera();
          setState('done');
          onDescriptor(Array.from(final.descriptor));
        }
      } else {
        setState('no_face');
      }
    }, 300);
  }

  function drawOverlay(box: any) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!box) return;

    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    const x = box.x * scaleX;
    const y = box.y * scaleY;
    const w = box.width * scaleX;
    const h = box.height * scaleY;

    const isGood = state === 'face_detected' || confidence >= 0.80;
    ctx.strokeStyle = isGood ? '#22c55e' : '#f97316';
    ctx.lineWidth = 2;
    ctx.shadowBlur = isGood ? 12 : 0;
    ctx.shadowColor = isGood ? '#22c55e' : '#f97316';

    // Cantos do retângulo (estilo biométrico)
    const corner = 20;
    ctx.beginPath();
    ctx.moveTo(x + corner, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + corner);
    ctx.moveTo(x + w - corner, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + corner);
    ctx.moveTo(x, y + h - corner);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + corner, y + h);
    ctx.moveTo(x + w, y + h - corner);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - corner, y + h);
    ctx.stroke();
  }

  if (!active) return null;

  const stateMessages: Record<FaceState, string> = {
    loading_models: 'Carregando modelos de IA...',
    requesting_camera: 'Solicitando acesso à câmera...',
    no_face: 'Posicione seu rosto na câmera',
    face_detected: 'Rosto detectado! Aguarde...',
    capturing: 'Capturando...',
    done: '✓ Rosto reconhecido!',
    error: errorMsg || 'Erro na câmera',
  };

  const stateColors: Record<FaceState, string> = {
    loading_models: 'rgba(249,115,22,0.15)',
    requesting_camera: 'rgba(249,115,22,0.15)',
    no_face: 'rgba(249,115,22,0.15)',
    face_detected: 'rgba(34,197,94,0.15)',
    capturing: 'rgba(34,197,94,0.15)',
    done: 'rgba(34,197,94,0.2)',
    error: 'rgba(239,68,68,0.15)',
  };

  const stateTextColors: Record<FaceState, string> = {
    loading_models: '#f97316',
    requesting_camera: '#f97316',
    no_face: '#f97316',
    face_detected: '#22c55e',
    capturing: '#22c55e',
    done: '#22c55e',
    error: '#ef4444',
  };

  return (
    <div className="space-y-3">
      {/* Viewport da câmera */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: '#111',
          border: `2px solid ${state === 'face_detected' || state === 'done' ? 'rgba(34,197,94,0.5)' : state === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(249,115,22,0.3)'}`,
          transition: 'border-color 0.3s ease',
          aspectRatio: '4/3',
          maxHeight: '240px',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // espelho
            display: state === 'loading_models' || state === 'error' ? 'none' : 'block',
          }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: 'scaleX(-1)',
            pointerEvents: 'none',
          }}
        />

        {/* Overlay de loading/estado sem vídeo */}
        {(state === 'loading_models' || state === 'requesting_camera' || state === 'error') && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(0,0,0,0.85)' }}
          >
            {state !== 'error' ? (
              <svg className="animate-spin w-8 h-8 text-orange-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
            <p className="text-sm text-gray-300 text-center px-4">{stateMessages[state]}</p>
          </div>
        )}

        {/* Ícone de feito (done) */}
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

      {/* Status bar */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all"
        style={{
          background: stateColors[state],
          border: `1px solid ${stateTextColors[state]}40`,
          color: stateTextColors[state],
        }}
      >
        {state === 'face_detected' || state === 'done' ? (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : state === 'error' ? (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        )}
        <span>{stateMessages[state]}</span>
      </div>
    </div>
  );
}
