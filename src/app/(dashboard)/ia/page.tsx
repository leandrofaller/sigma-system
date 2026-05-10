'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Loader2, Sparkles, Trash2, Copy,
  CheckCheck, ChevronDown, ChevronRight, Zap,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

/* ── Prompt categories ─────────────────────────────────── */
const CATEGORIES = [
  {
    label: 'Análise',
    color: '#6172f3',
    prompts: [
      'Analise este texto e extraia as informações mais relevantes:',
      'Identifique padrões e anomalias no seguinte relatório:',
      'Avalie o nível de ameaça com base nestes dados:',
      'Faça uma análise de contexto sobre:',
    ],
  },
  {
    label: 'Relatórios',
    color: '#10b981',
    prompts: [
      'Redija um parágrafo introdutório para um RELINT sobre:',
      'Resuma os principais pontos do seguinte documento:',
      'Elabore uma conclusão analítica sobre:',
      'Escreva um sumário executivo de:',
    ],
  },
  {
    label: 'Inteligência',
    color: '#8b5cf6',
    prompts: [
      'Quais são os principais indicadores de risco em:',
      'Identifique conexões e associações entre:',
      'Analise as vulnerabilidades presentes em:',
      'Faça um levantamento de ameaças sobre:',
    ],
  },
  {
    label: 'Operacional',
    color: '#f59e0b',
    prompts: [
      'Liste os procedimentos de segurança para:',
      'Quais medidas preventivas devem ser adotadas em:',
      'Elabore um plano de ação para:',
      'Descreva o protocolo adequado para:',
    ],
  },
];

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google',
};

/* ── Markdown renderer ──────────────────────────────────── */
function MarkdownMessage({ text }: { text: string }) {
  // Split preserving code fences
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
          return (
            <pre
              key={i}
              className="bg-gray-950 dark:bg-black text-green-400 rounded-xl p-4 text-xs font-mono overflow-x-auto my-2 border border-gray-800 leading-relaxed"
            >
              {code}
            </pre>
          );
        }
        // Process bold + inline code + line structure
        const lines = part.split('\n');
        return (
          <span key={i}>
            {lines.map((line, j) => {
              const isLast = j === lines.length - 1;
              // Heading
              const h3 = line.match(/^### (.+)/);
              if (h3) return (
                <h3 key={j} className="font-semibold text-sm mt-4 mb-1 text-gray-900 dark:text-gray-100 block">
                  {h3[1]}{!isLast && '\n'}
                </h3>
              );
              const h2 = line.match(/^## (.+)/);
              if (h2) return (
                <h2 key={j} className="font-semibold mt-4 mb-1 text-gray-900 dark:text-gray-100 block">
                  {h2[1]}{!isLast && '\n'}
                </h2>
              );
              // List item
              const li = line.match(/^[-•*] (.+)/);
              if (li) return (
                <div key={j} className="flex gap-2 my-0.5">
                  <span className="text-sigma-400 mt-0.5 flex-shrink-0">•</span>
                  <InlineText text={li[1]} />
                  {!isLast && '\n'}
                </div>
              );
              const oli = line.match(/^(\d+)\. (.+)/);
              if (oli) return (
                <div key={j} className="flex gap-2 my-0.5">
                  <span className="text-subtle min-w-[1.5rem] text-right flex-shrink-0">{oli[1]}.</span>
                  <InlineText text={oli[2]} />
                  {!isLast && '\n'}
                </div>
              );
              if (!line.trim() && !isLast) return <br key={j} />;
              return (
                <span key={j}>
                  <InlineText text={line} />
                  {!isLast && <br />}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

function InlineText({ text }: { text: string }) {
  // Handle **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs font-mono text-sigma-600 dark:text-sigma-400">
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/* ── Prompt sidebar category ────────────────────────────── */
function PromptCategory({ cat, onSelect }: { cat: typeof CATEGORIES[0]; onSelect: (p: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-subtle hover:text-body transition-colors uppercase tracking-wider"
      >
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
        <span className="flex-1 text-left">{cat.label}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-4 pb-1 space-y-0.5">
              {cat.prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => onSelect(p + ' ')}
                  className="w-full text-left text-xs text-subtle hover:text-body px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors leading-snug"
                >
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokens?: number;
}

export default function IAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/ai')
      .then((r) => r.json())
      .then((d) => { if (d.provider) setModelInfo(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const content = input.trim();
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: content }),
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
          content: 'Erro ao conectar com a IA. Verifique as configurações.',
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

  const selectPrompt = (p: string) => {
    setInput(p);
    textareaRef.current?.focus();
    setTimeout(adjustTextarea, 10);
  };

  return (
    <div className="animate-fade-in flex h-[calc(100vh-7.5rem)] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">

      {/* ── Sidebar: prompts ───────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col">
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-bold text-subtle uppercase tracking-wider">Sugestões</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {CATEGORIES.map((cat) => (
            <PromptCategory key={cat.label} cat={cat} onSelect={selectPrompt} />
          ))}
        </div>
        {modelInfo && (
          <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-xl px-2.5 py-2">
              <Zap className="w-3 h-3 text-sigma-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-title leading-none truncate">
                  {PROVIDER_LABELS[modelInfo.provider] ?? modelInfo.provider}
                </p>
                <p className="text-[10px] text-subtle leading-none mt-0.5 truncate">{modelInfo.model}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main chat ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-sigma-500 to-sigma-600 rounded-xl flex items-center justify-center shadow-md shadow-sigma-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-title leading-none">Consulta IA</p>
              <p className="text-xs text-subtle mt-0.5">Análise e suporte inteligente para operações</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1.5 text-xs text-subtle hover:text-red-500 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar conversa
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-sigma-500/10 to-sigma-600/10 rounded-3xl flex items-center justify-center mb-5 border border-sigma-200 dark:border-sigma-800">
                <Bot className="w-8 h-8 text-sigma-500" />
              </div>
              <h3 className="text-title font-semibold text-base mb-2">Assistente de Inteligência</h3>
              <p className="text-subtle text-sm max-w-xs leading-relaxed">
                Faça consultas analíticas, redija relatórios e obtenha suporte operacional.
                Selecione uma sugestão ao lado ou digite diretamente.
              </p>
              {modelInfo && (
                <div className="mt-5 flex items-center gap-2 bg-sigma-50 dark:bg-sigma-900/20 px-4 py-2 rounded-xl border border-sigma-100 dark:border-sigma-800">
                  <Zap className="w-3.5 h-3.5 text-sigma-500" />
                  <span className="text-xs text-sigma-600 dark:text-sigma-400 font-medium">
                    {PROVIDER_LABELS[modelInfo.provider] ?? modelInfo.provider} · {modelInfo.model}
                  </span>
                </div>
              )}
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5
                    ${isUser
                      ? 'bg-sigma-500 shadow-md shadow-sigma-500/25'
                      : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
                    {isUser
                      ? <User className="w-4 h-4 text-white" />
                      : <Bot className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                  </div>

                  {/* Bubble + meta */}
                  <div className={`max-w-[78%] flex flex-col gap-1.5 group ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
                      ${isUser
                        ? 'bg-sigma-500 text-white rounded-tr-sm shadow-sm shadow-sigma-500/20'
                        : 'bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-tl-sm'}`}>
                      {isUser
                        ? <p className="whitespace-pre-wrap">{msg.content}</p>
                        : <MarkdownMessage text={msg.content} />}
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-subtle">{formatDateTime(msg.timestamp)}</span>
                      {!isUser && (
                        <button
                          onClick={() => copyMessage(msg.id, msg.content)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          title="Copiar resposta"
                        >
                          {copiedId === msg.id
                            ? <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          {loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={1}
                placeholder="Digite sua consulta... (Enter envia · Shift+Enter nova linha)"
                className="w-full px-4 py-3 input-base resize-none leading-relaxed"
                style={{ minHeight: 46, maxHeight: 140 }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="bg-sigma-500 hover:bg-sigma-600 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all hover:shadow-lg hover:shadow-sigma-500/30 active:scale-95 flex-shrink-0"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-between items-center mt-1.5 px-1">
            <p className="text-xs text-subtle">Enter para enviar · Shift+Enter para nova linha</p>
            <p className={`text-xs ${input.length > 3000 ? 'text-red-400' : 'text-subtle'}`}>
              {input.length} caracteres
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
