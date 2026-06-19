import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * Trata erros de API de forma segura.
 * Registra o erro detalhado no console do servidor e retorna uma resposta genérica para o cliente com um ID de correlação.
 */
export function handleApiError(error: any, customMessage: string = 'Erro interno do servidor'): NextResponse {
  const errorId = randomUUID();
  
  // Registra no console do servidor com o ID de correlação
  console.error(`[API ERROR - ${errorId}]:`, error);
  
  // Retorna uma resposta higienizada ao cliente
  return NextResponse.json(
    { 
      error: customMessage,
      errorId 
    }, 
    { status: 500 }
  );
}
