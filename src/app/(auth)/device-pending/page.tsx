'use client';

import { useState, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MapPin, Loader2, AlertTriangle, CheckCircle2, Navigation, Send } from 'lucide-react';

type GeoStep = 'idle' | 'requesting' | 'captured' | 'submitting' | 'done' | 'geo-denied' | 'no-geo';

interface CapturedLocation {
  lat: number;
  lng: number;
  address: string;
}

export default function DevicePendingPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [step, setStep] = useState<GeoStep>('idle');
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [geoError, setGeoError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // Detectar mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMob = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
      setIsMobile(isMob);
    }
  }, []);

  // Polling automático e checagem inicial de aprovação
  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function checkStatus() {
      try {
        const res = await fetch('/api/device/status');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'AUTHORIZED') {
            await update({ deviceAuthorized: true });
            router.push('/dashboard');
            return true;
          }
        }
      } catch (err) {
        console.error('Erro ao verificar status do dispositivo:', err);
      }
      return false;
    }

    checkStatus().then((approved) => {
      if (!approved && step === 'done') {
        interval = setInterval(async () => {
          const isApproved = await checkStatus();
          if (isApproved) {
            clearInterval(interval);
          }
        }, 5000);
      }
    });

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, update, router]);

  async function checkManualApproval() {
    setCheckingApproval(true);
    try {
      const res = await fetch('/api/device/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'AUTHORIZED') {
          await update({ deviceAuthorized: true });
          router.push('/dashboard');
          return;
        }
      }
      alert('Sua solicitação ainda não foi aprovada pelo administrador.');
    } catch {
      alert('Erro ao verificar aprovação. Tente novamente.');
    } finally {
      setCheckingApproval(false);
    }
  }

  async function requestLocation() {
    setStep('requesting');
    setGeoError('');
    try {
      const isNative = typeof window !== 'undefined' && 
        ((window as any).Capacitor || navigator.userAgent.includes('SYGMA-MOBILE'));

      if (isNative) {
        // Função auxiliar para aguardar o carregamento do window.Capacitor
        const waitForCapacitor = (): Promise<void> => {
          return new Promise((resolve, reject) => {
            if ((window as any).Capacitor) {
              resolve();
              return;
            }
            let elapsed = 0;
            const interval = setInterval(() => {
              if ((window as any).Capacitor) {
                clearInterval(interval);
                resolve();
              } else {
                elapsed += 100;
                if (elapsed >= 3000) {
                  clearInterval(interval);
                  reject(new Error('Tempo limite de inicialização do Capacitor excedido.'));
                }
              }
            }, 100);
          });
        };

        // Aguarda a inicialização do bridge do Capacitor
        await waitForCapacitor();

        // Importa dinamicamente para evitar problemas de build no SSR do Next.js
        const { Geolocation } = await import('@capacitor/geolocation');

        // Checar e pedir permissão nativa de GPS
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const reqPerm = await Geolocation.requestPermissions();
          if (reqPerm.location !== 'granted') {
            setGeoError('Permissão de geolocalização negada no dispositivo. Vá nas configurações do seu celular e autorize o aplicativo.');
            setStep('geo-denied');
            return;
          }
        }

        // Obter coordenadas nativas
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
        });
        const { latitude: lat, longitude: lng } = pos.coords;
        await handleLocationSuccess(lat, lng);
      } else {
        // Fallback para web tradicional
        if (!navigator.geolocation) {
          setGeoError('Seu navegador não suporta geolocalização.');
          setStep('geo-denied');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            await handleLocationSuccess(lat, lng);
          },
          async (err) => {
            console.warn('Geolocalização nativa do navegador falhou, tentando fallback por IP. Erro:', err);
            try {
              const ipRes = await fetch('https://ipapi.co/json/');
              if (ipRes.ok) {
                const ipData = await ipRes.json();
                if (ipData && typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number') {
                  const lat = ipData.latitude;
                  const lng = ipData.longitude;
                  const address = `${ipData.city ?? ''}, ${ipData.region ?? ''}, ${ipData.country_name ?? ''} (Aproximado via IP)`.replace(/^,\s*/, '');
                  setLocation({ lat, lng, address });
                  setStep('captured');
                  return;
                }
              }
            } catch (ipErr) {
              console.error('Falha no fallback de geolocalização por IP:', ipErr);
            }

            const msgs: Record<number, string> = {
              1: 'Permissão negada. Clique no ícone de localização na barra do navegador e permita o acesso.',
              2: 'Não foi possível determinar sua localização. Verifique se o GPS está ativo ou se você tem sinal.',
              3: 'A solicitação expirou. O GPS pode estar desativado ou sem sinal. Tente novamente.',
            };
            setGeoError(msgs[err.code] ?? 'Erro ao obter localização.');
            setStep('geo-denied');
          },
          { timeout: 45000, maximumAge: 0, enableHighAccuracy: true }
        );
      }
    } catch (err: any) {
      console.error('Erro na captura da geolocalização:', err);
      setGeoError(err?.message || 'Erro ao obter localização.');
      setStep('geo-denied');
    }
  }

  async function handleLocationSuccess(lat: number, lng: number) {
    let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.display_name) address = data.display_name;
      }
    } catch {
      // mantém coordenadas como endereço
    }
    setLocation({ lat, lng, address });
    setStep('captured');
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
            {isMobile 
              ? 'Por questões de segurança, dispositivos móveis exigem a coleta de geolocalização para autorizar o acesso.'
              : 'Sua solicitação de acesso ao Portal LogiTrack está sendo verificada pela equipe de segurança. Você pode compartilhar sua localização para facilitar a verificação, mas não é obrigatório.'}
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
              {!isMobile && (
                <button
                  onClick={confirmNoGeo}
                  className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
                >
                  <Send className="w-4 h-4" />
                  Enviar sem localização
                </button>
              )}
            </div>
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
              {!isMobile && (
                <button
                  onClick={confirmNoGeo}
                  className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
                >
                  <Send className="w-4 h-4" />
                  Enviar sem localização
                </button>
              )}
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
              onClick={checkManualApproval}
              disabled={checkingApproval}
              className="w-full text-gray-300 hover:text-white font-medium py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {checkingApproval ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                'Já fui aprovado — Entrar novamente'
              )}
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
