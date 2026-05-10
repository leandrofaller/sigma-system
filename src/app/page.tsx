'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Package, Truck, MapPin, Clock, Shield, Star,
  ArrowRight, Phone, Mail, Instagram, Facebook,
  CheckCircle, BarChart3, Zap, Globe, Sun, Moon,
} from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';

export default function CoverPage() {
  const [trackingCode, setTrackingCode] = useState('');
  const [tracked, setTracked] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleTracking = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingCode.trim()) setTracked(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans transition-colors duration-300">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-cover-500 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                LogiTrack<span className="text-cover-500">Express</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-400">
              <a href="#servicos" className="hover:text-cover-500 dark:hover:text-cover-400 transition-colors">Serviços</a>
              <a href="#rastreamento" className="hover:text-cover-500 dark:hover:text-cover-400 transition-colors">Rastreamento</a>
              <a href="#sobre" className="hover:text-cover-500 dark:hover:text-cover-400 transition-colors">Sobre</a>
              <a href="#contato" className="hover:text-cover-500 dark:hover:text-cover-400 transition-colors">Contato</a>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
              </button>
              <Link
                href="/login"
                className="bg-cover-500 hover:bg-cover-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              >
                Portal do Cliente
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-20 bg-gradient-to-br from-cover-50 via-white to-orange-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 bg-cover-100 dark:bg-cover-900/30 text-cover-700 dark:text-cover-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
                <Zap className="w-3.5 h-3.5" /> Entrega Expressa em Todo Brasil
              </span>
              <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white leading-tight mb-6">
                Sua encomenda,
                <span className="text-cover-500"> no lugar certo,</span>
                <br /> na hora certa.
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-lg">
                Soluções completas em logística para empresas e pessoas físicas.
                Rastreamento em tempo real, entrega segura e atendimento 24h.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="#rastreamento"
                  className="bg-cover-500 hover:bg-cover-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-lg hover:-translate-y-0.5">
                  <Package className="w-4 h-4" /> Rastrear Encomenda
                </a>
                <a href="#servicos"
                  className="border-2 border-gray-200 dark:border-gray-700 hover:border-cover-300 dark:hover:border-cover-600 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all">
                  Nossos Serviços <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center gap-8 mt-10 pt-8 border-t border-gray-100 dark:border-gray-800">
                {[['50k+', 'Entregas/Mês'], ['98%', 'Satisfação'], ['24h', 'Suporte']].map(([num, label]) => (
                  <div key={label}>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{num}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-gradient-to-br from-cover-400 to-cover-700 rounded-3xl p-8 text-white shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <Truck className="w-8 h-8" />
                  <div>
                    <p className="font-bold text-lg">Entrega em Andamento</p>
                    <p className="text-cover-200 text-sm">Prevista para hoje</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { status: 'Coletado', time: '08:30', done: true },
                    { status: 'Em transito — Brasília', time: '11:45', done: true },
                    { status: 'Saiu para entrega', time: '14:20', done: true },
                    { status: 'Entregue', time: 'Em breve', done: false },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? 'bg-green-400' : 'bg-white/20 border-2 border-white/40'}`}>
                        {step.done && <CheckCircle className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${step.done ? 'text-white' : 'text-white/50'}`}>{step.status}</p>
                      </div>
                      <span className={`text-xs ${step.done ? 'text-cover-200' : 'text-white/30'}`}>{step.time}</span>
                    </div>
                  ))}
                </div>
                <div className="absolute -top-4 -right-4 bg-green-400 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                  ● AO VIVO
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Rastreamento */}
      <section id="rastreamento" className="py-16 bg-gray-900 dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Rastrear Encomenda</h2>
          <p className="text-gray-400 mb-8">Insira o código de rastreamento para ver o status da sua encomenda</p>
          <form onSubmit={handleTracking} className="flex gap-3">
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="Ex: LT123456789BR"
              className="flex-1 px-5 py-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:outline-none focus:border-cover-400 text-lg"
            />
            <button type="submit"
              className="bg-cover-500 hover:bg-cover-600 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg text-lg">
              Rastrear
            </button>
          </form>
          {tracked && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-6 bg-white/10 border border-white/20 rounded-xl p-6 text-left text-white">
              <p className="text-green-400 font-semibold mb-2">✓ Código encontrado: {trackingCode}</p>
              <p className="text-gray-300 text-sm">Status: <span className="text-white font-medium">Em rota de entrega — Previsão: hoje até 18h</span></p>
            </motion.div>
          )}
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Nossos Serviços</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">Soluções completas para sua necessidade logística</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Truck, title: 'Entrega Expressa', desc: 'Entrega em até 24h para capitais e regiões metropolitanas', light: 'bg-orange-50 text-cover-500', dark: 'dark:bg-orange-950/30 dark:text-cover-400' },
              { icon: Package, title: 'Carga Fracionada', desc: 'Transporte de volumes variados com segurança e pontualidade', light: 'bg-blue-50 text-blue-500', dark: 'dark:bg-blue-950/30 dark:text-blue-400' },
              { icon: Globe, title: 'Logística Nacional', desc: 'Cobertura em todos os estados brasileiros', light: 'bg-green-50 text-green-500', dark: 'dark:bg-green-950/30 dark:text-green-400' },
              { icon: Shield, title: 'Carga Especial', desc: 'Transporte de itens de alto valor com segurança reforçada', light: 'bg-purple-50 text-purple-500', dark: 'dark:bg-purple-950/30 dark:text-purple-400' },
            ].map((s, i) => (
              <motion.div key={i} whileHover={{ y: -5 }}
                className="p-6 border border-gray-100 dark:border-gray-800 rounded-2xl hover:shadow-lg dark:hover:shadow-gray-900 bg-white dark:bg-gray-800/50 transition-all">
                <div className={`w-12 h-12 ${s.light} ${s.dark} rounded-xl flex items-center justify-center mb-4`}>
                  <s.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{s.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-cover-500" />
                <span className="text-white font-bold">LogiTrack Express</span>
              </div>
              <p className="text-sm">Sua parceira logística de confiança em todo o Brasil.</p>
            </div>
            {[
              { title: 'Serviços', links: ['Entrega Expressa', 'Carga Fracionada', 'Logística Nacional', 'Carga Especial'] },
              { title: 'Empresa', links: ['Sobre Nós', 'Carreiras', 'Parceiros', 'Imprensa'] },
              { title: 'Contato', links: ['(11) 3000-0000', 'contato@logitrack.com.br', 'Mogi Mirim — SP', 'Atendimento 24h'] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-semibold mb-4">{col.title}</h4>
                <ul className="space-y-2 text-sm">
                  {col.links.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">© {new Date().getFullYear()} LogiTrack Express. Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <Instagram className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
              <Facebook className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
