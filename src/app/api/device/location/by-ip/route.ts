import { NextRequest, NextResponse } from 'next/server';

/**
 * 🌐 Geolocalização por IP (Fallback)
 * Usado quando o GPS falha durante o device-pending
 *
 * Retorna localização aproximada baseada no IP do cliente
 * Sem autenticação necessária (é um fallback público)
 */
export async function POST(req: NextRequest) {
  try {
    const clientIP = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     req.socket?.remoteAddress ||
                     'unknown';

    // Se for localhost, retornar localização fictícia
    if (clientIP === '127.0.0.1' || clientIP === 'localhost' || clientIP === '::1') {
      return NextResponse.json({
        latitude: -15.7739,
        longitude: -47.8822,
        city: 'Brasília',
        country: 'Brasil',
        method: 'localhost',
      });
    }

    // 🔑 Usar IP2Location ou MaxMind (sem API key para fallback básico)
    // Vamos usar um serviço gratuito como fallback
    const ipResponse = await Promise.race([
      fetch(`https://ipapi.co/${clientIP}/json/`, {
        signal: AbortSignal.timeout(3000)
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      ),
    ]);

    if (ipResponse.ok) {
      const data = await ipResponse.json();

      return NextResponse.json({
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city || data.region || 'Desconhecido',
        country: data.country_name || 'Desconhecido',
        accuracy_radius: data.accuracy || 'regional',
        method: 'ip-geolocation',
      });
    }

    // Fallback final: retornar erro
    return NextResponse.json(
      {
        error: 'Não foi possível obter localização por IP',
        hasLocation: false
      },
      { status: 503 }
    );

  } catch (error) {
    console.error('[GEO-IP] Erro ao obter geolocalização por IP:', error);
    return NextResponse.json(
      {
        error: 'Erro ao processar geolocalização',
        hasLocation: false
      },
      { status: 500 }
    );
  }
}
