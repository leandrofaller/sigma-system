'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Sparkles, Trash2, Copy, CheckCheck } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function IAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response || 'Sem resposta.',
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Erro ao conectar com a IA. Tente novamente.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-10rem)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-sigma-500" />
            Consulta IA
          </h1>
          <p className="text-gray-500 text-sm mt-1">Análise e suporte inteligente para operações</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition-colors px-3 py-1.5 border border-gray-200 rounded-lg hover:border-red-200">
            <Trash2 className="w-4 h-4" /> Limpar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="w-16 h-16 bg-sigma-50 rounded-2xl flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-sigma-500" />
            </div>
            <h3 className="text-gray-700 font-semibold mb-2">Assistente de Inteligência</h3>
            <p className="text-gray-400 text-sm max-w-sm">
              Faça consultas, análises de dados, redação de relatórios e muito mais.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 max-w-md">
              {[
                'Analise este texto e extraia informações relevantes',
                'Redija um parágrafo introdutório para um RELINT',
                'Quais são os indicadores de risco em...',
                'Resuma os principais pontos de segurança',
              ].map((sugg) => (
                <button key={sugg} onClick={() => setInput(sugg)}
                  className="text-left text-xs text-gray-500 border border-gray-200 rounded-xl p-3 hover:border-sigma-300 hover:text-sigma-600 transition-all">
                  {sugg}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center
                ${msg.role === 'user' ? 'bg-sigma-500' : 'bg-gray-100'}`}>
                {msg.role === 'user'
                  ? <User className="w-4 h-4 text-white" />
                  : <Bot className="w-4 h-4 text-gray-600" />}
              </div>
              <div className={`max-w-[75%] group relative ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-sigma-500 text-white rounded-tr-sm'
                    : 'bg-gray-50 border border-gray-100 text-gray-700 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDateTime(msg.timestamp)}</span>
                  {msg.role === 'assistant' && (
                    <button onClick={() => copyMessage(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600">
                      {copiedId === msg.id ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-gray-600" />
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Digite sua consulta..."
          className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-sigma-400 focus:ring-2 focus:ring-sigma-400/10 text-sm transition-all"
        />
        <button onClick={sendMessage} disabled={!input.trim() || loading}
          className="bg-sigma-500 hover:bg-sigma-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl transition-all hover:shadow-lg hover:shadow-sigma-500/25 active:scale-95">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
