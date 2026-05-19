'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MapPin, Loader2, AlertTriangle, CheckCircle2, Navigation } from 'lucide-react';

type GeoStep = 'idle' | 'requesting' | 'captured' | 'submitting' | 'done' | 'geo-denied';

interface CapturedLocation {
  lat: number;
  lng: number;
  address: string;
}

export default function DevicePendingPage() {
  const router = useRouter();
  const [step, setStep] = useState<GeoStep>('idle');
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [geoError, setGeoError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  async function requestLocation() {
    if (!navigator.geolocation) {
      setGeoError('Seu navegador não suporta geolocalização.');
      setStep('geo-denied');
      return;
    }
    setStep('requesting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.display_name) address = data.display_name;
          }
        } catch {
          // Falha silenciosa: mantém coordenadas como endereço
        }
        setLocation({ lat, lng, address });
        setStep('captured');
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Permissão negada. Clique no ícone de localização na barra do navegador e permita o acesso.',
          2: 'Não foi possível determinar sua localização. Verifique se o GPS está ativo.',
          3: 'A solicitação expirou. Tente novamente.',
        };
        setGeoError(msgs[err.code] ?? 'Erro ao obter localização.');
        setStep('geo-denied');
      },
      { timeout: 15000, maximumAge: 0 }
    );
  }

  async function submitLocation() {
    if (!location) return;
    setStep('submitting');
    try {
      const res = await fetch('/api/device/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: location.lat, lng: location.lng, address: location.address }),
      });
      if (res.ok) {
        setStep('done');
      } else {
        setGeoError('Erro ao enviar localização. Tente novamente.');
        setStep('captured');
      }
    } catch {
      setGeoError('Erro de conexão. Tente novamente.');
      setStep('captured');
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirect: false });
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Acesso em Análise</h1>
          <p className="text-gray-400 text-sm mt-1">Portal do Cliente — LogiTrack Express</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-2xl p-8 space-y-6">

          <p className="text-gray-300 text-sm leading-relaxed text-center">
            Sua solicitação de acesso ao Portal LogiTrack está sendo verificada
            pela equipe de segurança. Para enviar sua solicitação, precisamos
            confirmar sua localização atual.
          </p>

          {/* Step: idle */}
          {step === 'idle' && (
            <button
              onClick={requestLocation}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
            >
              <Navigation className="w-4 h-4" />
              Compartilhar minha localização
            </button>
          )}

          {/* Step: requesting */}
          {step === 'requesting' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
              <p className="text-gray-400 text-sm">Aguardando permissão do navegador…</p>
            </div>
          )}

          {/* Step: geo-denied */}
          {step === 'geo-denied' && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-300 text-xs leading-relaxed">{geoError}</p>
              </div>
              <button
                onClick={requestLocation}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                <Navigation className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Step: captured */}
          {step === 'captured' && location && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <MapPin className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-green-400 text-xs font-medium mb-0.5">Localização capturada</p>
                  <p className="text-gray-300 text-xs leading-relaxed break-words">{location.address}</p>
                </div>
              </div>
              {geoError && (
                <p className="text-red-400 text-xs text-center">{geoError}</p>
              )}
              <button
                onClick={submitLocation}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                Enviar solicitação para análise
              </button>
            </div>
          )}

          {/* Step: submitting */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
              <p className="text-gray-400 text-sm">Enviando solicitação…</p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="rounded-xl px-4 py-4 flex items-start gap-3"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-400 text-sm font-medium">Solicitação enviada!</p>
                <p className="text-gray-400 text-xs mt-1">
                  Aguardando aprovação do administrador. Após aprovação, clique em
                  "Já fui aprovado" para entrar.
                </p>
              </div>
            </div>
          )}

          {/* Footer buttons — always visible */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => router.push('/login')}
              className="w-full text-gray-300 hover:text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Já fui aprovado — Entrar novamente
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-gray-500 hover:text-red-400 font-medium py-2 rounded-xl transition-colors text-sm disabled:opacity-50"
            >
              {signingOut ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Acesso exclusivo para usuários autorizados
        </p>
      </div>
    </div>
  );
}
