'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MapPin, Loader2, AlertTriangle, CheckCircle2, Navigation, Send, Wifi, WifiOff } from 'lucide-react';

type GeoStep = 'idle' | 'requesting' | 'captured' | 'submitting' | 'done' | 'geo-denied' | 'no-geo' | 'fallback-attempting';

interface CapturedLocation {
  lat: number;
  lng: number;
  address: string;
  method: 'gps' | 'ip'; // GPS ou IP-based
}

export default function DevicePendingPage() {
  const router = useRouter();
  const [step, setStep] = useState<GeoStep>('idle');
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [geoError, setGeoError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [progress, setProgress] = useState(0); // Para mostrar progresso
  const [attemptsLeft, setAttemptsLeft] = useState(2); // Tentativas restantes

  // 🔄 Função para reverter coordenadas em endereço (com fallback)
  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    try {
      // Tenta com Google Maps (mais rápido e confiável)
      // Se não tiver chave, usa OpenStreetMap como fallback
      const res = await Promise.race([
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
        ),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000) // Timeout 5s
        ),
      ]);

      if (res.ok) {
        const data = await res.json();
        if (data.display_name) return data.display_name;
      }
    } catch (err) {
      console.log('[GEO] Reverse geocode falhou, usando fallback:', err);
    }

    return fallback;
  }

  // 🌐 Função para obter localização por IP (fallback)
  async function getLocationByIP(): Promise<CapturedLocation | null> {
    try {
      const res = await fetch('/api/device/location/by-ip', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const address = data.city && data.country
            ? `${data.city}, ${data.country}`
            : data.city || data.country || 'Localização por IP';

          return {
            lat: data.latitude,
            lng: data.longitude,
            address: address,
            method: 'ip',
          };
        }
      }
    } catch (err) {
      console.log('[GEO] Fallback por IP falhou:', err);
    }
    return null;
  }

  // 📍 Função principal de geolocalização com retry
  async function requestLocation() {
    if (!navigator.geolocation) {
      setGeoError('Seu navegador não suporta geolocalização.');
      setStep('geo-denied');
      return;
    }

    setStep('requesting');
    setProgress(0);
    setGeoError('');
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simular progresso visual
      progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 90));
      }, 1000);

      // Esperar por geolocalização com timeout maior (45s)
      const geoPromise = new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          {
            timeout: 45000,        // ⬆️ Aumentado de 15s para 45s
            maximumAge: 0,          // Sempre obter posição fresca
            enableHighAccuracy: true // ⬆️ Tentar usar GPS de alta precisão
          }
        );
      });

      const coords = await geoPromise;
      const { latitude: lat, longitude: lng } = coords;

      // Obter endereço
      const address = await reverseGeocode(lat, lng);

      setLocation({ lat, lng, address, method: 'gps' });
      setProgress(100);

      if (progressInterval) clearInterval(progressInterval);
      setStep('captured');
      setAttemptsLeft(2); // Reset tentativas se sucesso
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);

      const errorCode = err?.code;
      const msgs: Record<number, string> = {
        1: 'Permissão negada. Clique no ícone de localização na barra do navegador e permita o acesso.',
        2: 'Não foi possível determinar sua localização. Verifique se o GPS está ativo e você tem sinal.',
        3: 'A solicitação expirou (45 segundos). O GPS pode estar desativado ou sem sinal.',
      };

      const errorMsg = msgs[errorCode] ?? 'Erro ao obter localização.';
      setGeoError(errorMsg);

      // ⚡ Se falhou, tentar fallback por IP
      if (attemptsLeft > 0) {
        setStep('fallback-attempting');
        console.log('[GEO] Tentando fallback por IP...');

        const ipLocation = await getLocationByIP();
        if (ipLocation) {
          setLocation(ipLocation);
          setGeoError('');
          setStep('captured');
          setAttemptsLeft(attemptsLeft - 1);
          return;
        }
      }

      setAttemptsLeft(Math.max(0, attemptsLeft - 1));
      setStep('geo-denied');
    }
  }

  function confirmNoGeo() {
    setStep('no-geo');
  }

  async function submitLocation(withLocation: boolean = true) {
    setStep('submitting');
    try {
      const body = withLocation && location
        ? { lat: location.lat, lng: location.lng, address: location.address }
        : { lat: null, lng: null, address: null };

      const res = await fetch('/api/device/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStep('done');
      } else {
        setGeoError('Erro ao enviar solicitação. Tente novamente.');
        setStep(withLocation ? 'captured' : 'no-geo');
      }
    } catch {
      setGeoError('Erro de conexão. Tente novamente.');
      setStep(withLocation ? 'captured' : 'no-geo');
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
            pela equipe de segurança. Você pode compartilhar sua localização para
            facilitar a verificação, mas não é obrigatório.
          </p>

          {/* Step: idle */}
          {step === 'idle' && (
            <div className="space-y-2">
              <button
                onClick={requestLocation}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                <Navigation className="w-4 h-4" />
                Compartilhar minha localização
              </button>
              <button
                onClick={confirmNoGeo}
                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                <Send className="w-4 h-4" />
                Enviar sem localização
              </button>
            </div>
          )}

          {/* Step: requesting */}
          {step === 'requesting' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
              <div className="w-full">
                <p className="text-gray-400 text-sm text-center mb-2">Obtendo sua localização…</p>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-gray-500 text-xs text-center mt-2">Tempo limite: 45 segundos</p>
              </div>
            </div>
          )}

          {/* Step: fallback-attempting */}
          {step === 'fallback-attempting' && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Wifi className="w-7 h-7 text-blue-400 animate-pulse" />
              <p className="text-gray-400 text-sm text-center">GPS indisponível, usando localização por IP…</p>
            </div>
          )}

          {/* Step: geo-denied */}
          {step === 'geo-denied' && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-yellow-300 text-xs leading-relaxed">{geoError}</p>
                  {attemptsLeft > 0 && (
                    <p className="text-yellow-400 text-xs mt-2 font-medium">
                      Tentativas restantes: {attemptsLeft}
                    </p>
                  )}
                </div>
              </div>
              {attemptsLeft > 0 && (
                <button
                  onClick={requestLocation}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
                >
                  <Navigation className="w-4 h-4" />
                  Tentar novamente ({attemptsLeft})
                </button>
              )}
              <button
                onClick={confirmNoGeo}
                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                <Send className="w-4 h-4" />
                Enviar sem localização
              </button>
            </div>
          )}

          {/* Step: captured */}
          {step === 'captured' && location && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                {location.method === 'gps' ? (
                  <MapPin className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Wifi className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-medium mb-0.5 ${location.method === 'gps' ? 'text-green-400' : 'text-blue-400'}`}>
                    {location.method === 'gps' ? '📍 Localização GPS' : '🌐 Localização por IP'}
                  </p>
                  <p className="text-gray-300 text-xs leading-relaxed break-words">{location.address}</p>
                </div>
              </div>
              <button
                onClick={submitLocation}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                Enviar solicitação para análise
              </button>
            </div>
          )}

          {/* Step: no-geo (enviando sem localização) */}
          {step === 'no-geo' && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0zM8 8a1 1 0 000 2h.01a1 1 0 000-2H8zm4-1a1 1 0 11-2 0 1 1 0 012 0zm1 3a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p className="text-blue-300 text-xs leading-relaxed">
                  Você enviará a solicitação sem localização. O administrador poderá ainda autorizar seu dispositivo baseado em outros dados (IP, navegador, etc).
                </p>
              </div>
              {geoError && (
                <p className="text-red-400 text-xs text-center">{geoError}</p>
              )}
              <button
                onClick={() => submitLocation(false)}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                Enviar solicitação sem localização
              </button>
              <button
                onClick={() => setStep('idle')}
                className="w-full text-gray-400 hover:text-gray-200 font-medium py-2 rounded-xl transition-colors text-sm"
              >
                Voltar
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
