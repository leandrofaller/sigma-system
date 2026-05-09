import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './db';

async function getAIConfig() {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'ai_provider' } });
  return (config?.value as any) ?? { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
}

const systemPrompt = `Você é um assistente de inteligência especializado em análise de informações,
elaboração de relatórios e apoio operacional. Responda sempre em português brasileiro de forma
profissional, objetiva e precisa.`;

export async function queryAI(userId: string, query: string, context?: string): Promise<string> {
  const config = await getAIConfig();
  let response = '';
  let tokens = 0;
  const fullSystemPrompt = context ? `${systemPrompt}\n\nContexto: ${context}` : systemPrompt;

  if (config.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: config.model || 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: query }],
    });
    response = msg.content[0].type === 'text' ? msg.content[0].text : 'Sem resposta';
    tokens = msg.usage.input_tokens + msg.usage.output_tokens;

  } else if (config.provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = (config.model === 'gemini-1.5-pro' ? 'gemini-1.5-flash' : config.model) || 'gemini-1.5-flash';
    const geminiModel = genAI.getGenerativeModel({ model: modelName });
    const result = await geminiModel.generateContent([
      { text: fullSystemPrompt },
      { text: `Pergunta: ${query}` },
    ]);
    response = result.response.text();

  } else if (config.provider === 'openai' && process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: config.model || 'gpt-4o',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: query },
      ],
      max_tokens: 2000,
    });
    response = completion.choices[0]?.message?.content ?? 'Sem resposta';
    tokens = completion.usage?.total_tokens ?? 0;

  } else {
    const providerKey: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      openai: 'OPENAI_API_KEY',
    };
    const key = providerKey[config.provider] || 'uma chave de API';
    throw new Error(
      `Provedor "${config.provider}" selecionado mas a variável ${key} não está configurada no Coolify.`
    );
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
