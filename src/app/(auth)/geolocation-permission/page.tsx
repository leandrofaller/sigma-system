'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MapPin, AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

type Status = 'waiting' | 'requesting' | 'captured' | 'denied' | 'submitting' | 'error' | 'success';

interface GeoData {
  lat: number;
  lng: number;
  accuracy: number;
  address: string | null;
}

export default function GeolocationPermissionPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [status, setStatus] = useState<Status>('waiting');
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [error, setError] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMob = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
      setIsMobile(isMob);
    }
  }, []);

  const requestLocation = async () => {
    setStatus('requesting');
    setError('');

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

        // Aguarda a ponte do Capacitor inicializar
        await waitForCapacitor();

        // Importa o plugin nativo dinamicamente
        const { Geolocation } = await import('@capacitor/geolocation');

        // Checar e pedir permissão de GPS nativa
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const reqPerm = await Geolocation.requestPermissions();
          if (reqPerm.location !== 'granted') {
            setStatus('denied');
            setError('Permissão de geolocalização negada no dispositivo. Vá nas configurações do seu celular e autorize o aplicativo.');
            return;
          }
        }

        // Obter coordenadas
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
        });
        const { latitude, longitude, accuracy } = pos.coords;
        await handleLocationSuccess(latitude, longitude, accuracy);
      } else {
        // Fallback para web tradicional
        if (!navigator.geolocation) {
          setStatus('denied');
          setError('Geolocalização não é suportada pelo seu navegador');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            await handleLocationSuccess(latitude, longitude, accuracy);
          },
          async (error) => {
            console.warn('Geolocalização nativa do navegador falhou, tentando fallback por IP. Erro:', error);
            try {
              const ipRes = await fetch('https://ipapi.co/json/');
              if (ipRes.ok) {
                const ipData = await ipRes.json();
                if (ipData && typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number') {
                  const lat = ipData.latitude;
                  const lng = ipData.longitude;
                  await handleLocationSuccess(lat, lng, 5000); // 5000m de precisão para IP
                  return;
                }
              }
            } catch (ipErr) {
              console.error('Falha no fallback de geolocalização por IP:', ipErr);
            }

            setStatus('denied');
            let msg = 'Erro desconhecido ao obter localização';
            if (error.code === 1) {
              msg = 'Você negou a permissão. Clique no ícone de localização na barra do navegador para permitir.';
            } else if (error.code === 2) {
              msg = 'Localização indisponível (verifique se o GPS está ligado)';
            } else if (error.code === 3) {
              msg = 'Timeout ao obter localização (tente novamente)';
            }
            setError(msg);
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          }
        );
      }
    } catch (err: any) {
      console.error('Erro na captura de geolocalização:', err);
      setStatus('denied');
      setError(err?.message || 'Erro ao obter localização.');
    }
  };

  const handleLocationSuccess = async (latitude: number, longitude: number, accuracy: number) => {
    // Reverse geocoding via Nominatim
    let address: string | null = null;
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        address = geoData.address?.city || geoData.address?.town || geoData.address?.village ||
                 geoData.address?.county || geoData.name || null;
      }
    } catch (err) {
      console.warn('[Geo] Reverse geocoding falhou:', err);
    }

    const data: GeoData = { lat: latitude, lng: longitude, accuracy, address };
    setGeoData(data);
    setStatus('captured');

    // Auto-submit após 2 segundos
    setTimeout(() => submitLocation(data), 2000);
  };

  const submitLocation = async (data: GeoData) => {
    setStatus('submitting');

    try {
      const res = await fetch('/api/geolocation/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          address: data.address,
        }),
      });

      if (!res.ok) {
        throw new Error('Erro ao submeter localização');
      }

      const result = await res.json();
      if (result.success) {
        setStatus('success');
        // Atualizar a sessão dinâmica do NextAuth
        await update({ geoStatus: 'authorized' });
        // Redirecionar para dashboard após 1.5s
        setTimeout(() => router.push('/dashboard'), 1500);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };

  const handleDeny = async () => {
    try {
      const res = await fetch('/api/geolocation/deny-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setStatus('waiting');
        setError('');
        alert(
          'Sua permissão foi negada. Um administrador precisará autorizar seu acesso ao sistema. Você será contatado em breve.'
        );
      }
    } catch (err) {
      console.error('Erro ao negar permissão:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Card Principal */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-sigma-100 dark:bg-sigma-900/30 rounded-full flex items-center justify-center">
                <MapPin className="w-8 h-8 text-sigma-600 dark:text-sigma-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Compartilhe sua Localização
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Para acessar o sistema, precisamos registrar sua localização de trabalho
            </p>
          </div>

          {/* Razão */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
              Por que precisamos?
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
              <li>✓ Registrar presença de trabalho</li>
              <li>✓ Segurança da agência</li>
              <li>✓ Auditoria e conformidade</li>
            </ul>
          </div>

          {/* Status Estados */}
          {status === 'waiting' && (
            <div className="space-y-4">
              <button
                onClick={requestLocation}
                className="w-full bg-sigma-600 hover:bg-sigma-700 dark:bg-sigma-500 dark:hover:bg-sigma-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                <MapPin className="inline-block w-5 h-5 mr-2" />
                Compartilhar Minha Localização
              </button>
              {!isMobile && (
                <button
                  onClick={handleDeny}
                  className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium py-2 px-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  Negar por enquanto
                </button>
              )}
            </div>
          )}

          {status === 'requesting' && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <Loader2 className="w-8 h-8 text-sigma-600 dark:text-sigma-400 animate-spin" />
              <p className="text-gray-600 dark:text-gray-400">Solicitando permissão...</p>
              <p className="text-xs text-gray-500">
                Um popup pode aparecer solicitando acesso à sua localização
              </p>
            </div>
          )}

          {status === 'captured' && geoData && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900 dark:text-green-300">
                    Localização capturada!
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-400 mt-1">
                    {geoData.address || `${geoData.lat.toFixed(4)}, ${geoData.lng.toFixed(4)}`}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-500 mt-1">
                    Precisão: ±{Math.round(geoData.accuracy)}m
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Carregando...
              </p>
            </div>
          )}

          {status === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <Loader2 className="w-8 h-8 text-sigma-600 dark:text-sigma-400 animate-spin" />
              <p className="text-gray-600 dark:text-gray-400">
                Salvando localização...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-green-900 dark:text-green-300">
                    Sucesso!
                  </p>
                  <p className="text-sm text-green-800 dark:text-green-400 mt-1">
                    Sua localização foi registrada. Redirecionando...
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'denied' && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900 dark:text-amber-300">
                    Permissão negada
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                    {error || 'Não foi possível obter sua localização'}
                  </p>
                </div>
              </div>
              <button
                onClick={requestLocation}
                className="w-full bg-sigma-600 hover:bg-sigma-700 dark:bg-sigma-500 dark:hover:bg-sigma-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-900 dark:text-red-300">
                    Erro
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-400 mt-1">
                    {error}
                  </p>
                </div>
              </div>
              <button
                onClick={requestLocation}
                className="w-full bg-sigma-600 hover:bg-sigma-700 dark:bg-sigma-500 dark:hover:bg-sigma-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-500 space-y-1">
          <p>🔒 Seus dados de localização são protegidos</p>
          <p>Apenas administradores da agência podem visualizá-los</p>
        </div>
      </div>
    </div>
  );
}
