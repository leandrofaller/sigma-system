import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './db';

async function getAIConfig() {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'ai_provider' } });
  return (config?.value as any) ?? { provider: 'openai', model: 'gpt-4o' };
}

export async function queryAI(userId: string, query: string, context?: string): Promise<string> {
  const config = await getAIConfig();
  let response = '';
  let tokens = 0;

  const systemPrompt = `Você é um assistente de inteligência especializado em análise de informações,
  elaboração de relatórios e apoio operacional. Responda sempre em português brasileiro de forma
  profissional, objetiva e precisa. ${context ? `Contexto: ${context}` : ''}`;

  if (config.provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: config.model || 'gemini-1.5-pro' });
    const result = await model.generateContent(`${systemPrompt}\n\nPergunta: ${query}`);
    response = result.response.text();
  } else if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: config.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      max_tokens: 2000,
    });
    response = completion.choices[0]?.message?.content ?? 'Sem resposta';
    tokens = completion.usage?.total_tokens ?? 0;
  } else {
    response = 'Nenhum provedor de IA configurado. Configure nas definições do sistema.';
  }

  await prisma.aIQuery.create({
    data: {
      userId,
      query,
      response,
      provider: config.provider,
      model: config.model,
      tokens,
    },
  });

  return response;
}
