import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { prisma } from './db';

const DEPRECATED_MODELS: Record<string, string> = {
  'gemini-pro': 'gemini-1.5-flash',
  'gemini-1.0-pro': 'gemini-1.5-flash',
  'text-bison-001': 'gemini-1.5-flash',
};

async function getAIConfig() {
  const config = await prisma.systemConfig.findUnique({ where: { key: 'ai_provider' } });
  const value = (config?.value as any) ?? { provider: 'groq', model: 'llama-3.3-70b-versatile' };
  if (value.model && DEPRECATED_MODELS[value.model]) {
    value.model = DEPRECATED_MODELS[value.model];
  }
  return value;
}

async function getAPIKey(provider: string): Promise<string | undefined> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: `${provider}_api_key` } });
  const dbKey = (cfg?.value as any)?.key?.trim();
  if (dbKey) return dbKey;
  const envMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  return envMap[provider];
}

export async function getAIProviderInfo(): Promise<{ provider: string; model: string }> {
  const config = await getAIConfig();
  return { provider: config.provider, model: config.model };
}

const systemPrompt = `Você é um assistente de inteligência especializado em análise de informações,
elaboração de relatórios e apoio operacional. Responda sempre em português brasileiro de forma
profissional, objetiva e precisa.`;

export async function queryAI(userId: string, query: string, context?: string): Promise<string> {
  const config = await getAIConfig();
  let response = '';
  let tokens = 0;
  const fullSystemPrompt = context ? `${systemPrompt}\n\nContexto: ${context}` : systemPrompt;

  const apiKey = await getAPIKey(config.provider);

  if (config.provider === 'anthropic' && apiKey) {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: config.model || 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: query }],
    });
    response = msg.content[0].type === 'text' ? msg.content[0].text : 'Sem resposta';
    tokens = msg.usage.input_tokens + msg.usage.output_tokens;

  } else if (config.provider === 'gemini' && apiKey) {
    const modelName = config.model || 'gemini-1.5-flash';
    const supportsSystemInstruction = modelName.includes('1.5') || modelName.includes('2.');
    const requestBody = supportsSystemInstruction
      ? {
          system_instruction: { parts: [{ text: fullSystemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: query }] }],
          generationConfig: { maxOutputTokens: 2000 },
        }
      : {
          contents: [{ role: 'user', parts: [{ text: `${fullSystemPrompt}\n\nPergunta: ${query}` }] }],
          generationConfig: { maxOutputTokens: 2000 },
        };
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }
    );
    if (!geminiRes.ok) {
      const errJson = await geminiRes.json().catch(() => ({}));
      throw new Error(`Gemini (${modelName}): ${errJson.error?.message || geminiRes.statusText}`);
    }
    const geminiData = await geminiRes.json();
    response = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Sem resposta';

  } else if (config.provider === 'openai' && apiKey) {
    const openai = new OpenAI({ apiKey });
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

  } else if (config.provider === 'groq' && apiKey) {
    // Groq is OpenAI-compatible — same SDK, different base URL
    const groq = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
    const completion = await groq.chat.completions.create({
      model: config.model || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: query },
      ],
      max_tokens: 2000,
    });
    response = completion.choices[0]?.message?.content ?? 'Sem resposta';
    tokens = completion.usage?.total_tokens ?? 0;

  } else {
    const where = apiKey ? 'a chave está configurada mas o provedor é desconhecido' : 'nenhuma chave de API encontrada';
    throw new Error(
      `Provedor "${config.provider}" não pôde ser usado: ${where}. Configure a chave em Configurações → Inteligência Artificial.`
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
