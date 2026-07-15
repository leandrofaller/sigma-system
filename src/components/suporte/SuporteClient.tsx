'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LifeBuoy, HelpCircle, AlertTriangle, Lightbulb, MoreHorizontal,
  Send, Paperclip, Mic, Square, Play, Pause, Video, Eye, Trash2,
  CheckCircle, Loader2, Clock, ShieldAlert, ArrowLeft
} from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface SupportAttachment {
  id: string
  nomeOriginal: string
  tipoMime: string
  urlS3: string
  tamanho: number
  urlPresigned?: string
}

interface SupportTicket {
  id: string
  assunto: string
  categoria: string
  descricao: string
  status: string
  prioridade: string
  usuario: {
    name: string
    email: string
    role: string
  }
  attachments: SupportAttachment[]
  createdAt: string
}

export function SuporteClient({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'novo' | 'historico'>('novo')
  const [categoria, setCategoria] = useState<string>('')
  const [assunto, setAssunto] = useState<string>('')
  const [descricao, setDescricao] = useState<string>('')
  const [prioridade, setPrioridade] = useState<string>('MEDIA')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)

  // Chamados carregados
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)

  // Estados de Gravação de Áudio
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const audioTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Estados de Gravação de Tela (Vídeo)
  const [isRecordingScreen, setIsRecordingScreen] = useState(false)
  const [screenBlob, setScreenBlob] = useState<Blob | null>(null)
  const [screenUrl, setScreenUrl] = useState<string | null>(null)
  const [screenDuration, setScreenDuration] = useState(0)
  const screenTimerRef = useRef<NodeJS.Timeout | null>(null)
  const screenMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenChunksRef = useRef<Blob[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeTab === 'historico') {
      carregarTickets()
    }
  }, [activeTab])

  // Limpezas de timers ao desmontar o componente
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current)
      if (screenTimerRef.current) clearInterval(screenTimerRef.current)
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const carregarTickets = async () => {
    setLoadingTickets(true)
    try {
      const res = await fetch('/api/suporte')
      if (!res.ok) throw new Error('Falha ao obter chamados')
      const data = await res.json()
      setTickets(data.tickets || [])
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar seu histórico de chamados.')
    } finally {
      setLoadingTickets(false)
    }
  }

  // ──── GRAVAÇÃO DE ÁUDIO OPERACIONAL ────
  const startAudioRecording = async () => {
    audioChunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)

        // Adiciona à lista de arquivos selecionados
        const file = new File([blob], `gravacao_audio_${Date.now()}.webm`, { type: 'audio/webm' })
        setSelectedFiles(prev => [...prev, file])
        toast.success('Gravação de áudio anexada!')

        // Parar os tracks da stream de áudio
        stream.getTracks().forEach(track => track.stop())
      }

      audioMediaRecorderRef.current = recorder
      recorder.start()
      setIsRecordingAudio(true)
      setAudioDuration(0)

      audioTimerRef.current = setInterval(() => {
        setAudioDuration(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Erro de permissão ou de dispositivo para áudio:', err)
      toast.error('Não foi possível acessar seu microfone. Verifique as permissões.')
    }
  }

  const stopAudioRecording = () => {
    if (audioMediaRecorderRef.current && isRecordingAudio) {
      audioMediaRecorderRef.current.stop()
      setIsRecordingAudio(false)
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current)
        audioTimerRef.current = null
      }
    }
  }

  // ──── GRAVAÇÃO DE TELA (SCREEN RECORDING) NATIVA ────
  const startScreenRecording = async () => {
    screenChunksRef.current = []
    try {
      // Captura a tela e o som da tela
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })

      screenStreamRef.current = displayStream

      // Se o usuário fechar o compartilhamento pelo botão nativo do navegador
      displayStream.getVideoTracks()[0].onended = () => {
        if (isRecordingScreen) {
          stopScreenRecording()
        }
      }

      const recorder = new MediaRecorder(displayStream, { mimeType: 'video/webm' })

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          screenChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(screenChunksRef.current, { type: 'video/webm' })
        setScreenBlob(blob)
        const url = URL.createObjectURL(blob)
        setScreenUrl(url)

        // Adiciona à lista de arquivos selecionados
        const file = new File([blob], `gravacao_tela_${Date.now()}.webm`, { type: 'video/webm' })
        setSelectedFiles(prev => [...prev, file])
        toast.success('Gravação de tela anexada com sucesso!')

        displayStream.getTracks().forEach(track => track.stop())
      }

      screenMediaRecorderRef.current = recorder
      recorder.start()
      setIsRecordingScreen(true)
      setScreenDuration(0)

      screenTimerRef.current = setInterval(() => {
        setScreenDuration(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Erro ao compartilhar ou gravar a tela:', err)
      toast.error('Compartilhamento de tela cancelado ou não suportado.')
    }
  }

  const stopScreenRecording = () => {
    if (screenMediaRecorderRef.current && isRecordingScreen) {
      screenMediaRecorderRef.current.stop()
      setIsRecordingScreen(false)
      if (screenTimerRef.current) {
        clearInterval(screenTimerRef.current)
        screenTimerRef.current = null
      }
    }
  }

  // ──── ANEXOS TRADICIONAIS ────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files])
      toast.success(`${files.length} arquivo(s) adicionado(s)`)
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // ──── ENVIO DO CHAMADO ────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!categoria) {
      toast.error('Selecione a categoria da sua necessidade')
      return
    }
    if (!assunto.trim()) {
      toast.error('Insira o assunto do suporte')
      return
    }
    if (!descricao.trim()) {
      toast.error('Descreva detalhadamente a sua solicitação')
      return
    }

    setSending(true)
    const toastId = toast.loading('Registrando chamado e enviando arquivos...')

    try {
      const formData = new FormData()
      formData.append('assunto', assunto.trim())
      formData.append('categoria', categoria)
      formData.append('descricao', descricao.trim())
      formData.append('prioridade', prioridade)

      // Adicionar arquivos selecionados
      selectedFiles.forEach((file) => {
        formData.append('files', file)
      })

      const res = await fetch('/api/suporte', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Erro na resposta do servidor')
      }

      toast.success('Chamado de suporte aberto com sucesso!', { id: toastId })
      
      // Limpar formulário
      setCategoria('')
      setAssunto('')
      setDescricao('')
      setPrioridade('MEDIA')
      setSelectedFiles([])
      setAudioBlob(null)
      setAudioUrl(null)
      setScreenBlob(null)
      setScreenUrl(null)
      
      // Redireciona para histórico
      setActiveTab('historico')
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao enviar chamado: ${err.message || 'desconhecido'}`, { id: toastId })
    } finally {
      setSending(false)
    }
  }

  // Formatador de segundos (00:00)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const getCategoriaDetails = (cat: string) => {
    switch (cat) {
      case 'DUVIDA':
        return { label: 'Dúvida Operacional', style: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' }
      case 'PROBLEMA':
        return { label: 'Problema / Erro', style: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' }
      case 'SUGESTAO':
        return { label: 'Sugestão de Melhoria', style: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400' }
      default:
        return { label: 'Outro Assunto', style: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' }
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ABERTO':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400">Aberto</span>
      case 'EM_ATENDIMENTO':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-400">Em Atendimento</span>
      case 'RESOLVIDO':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-400">Resolvido</span>
      default:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400">Fechado</span>
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 md:p-6 overflow-hidden bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100">
      
      {/* Cabeçalho do Canal de Suporte */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-black flex items-center gap-2.5">
            <LifeBuoy className="w-7 h-7 text-purple-600 dark:text-purple-400 animate-spin-slow" />
            Canal de Suporte Operacional
          </h1>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Abra chamados técnicos e envie arquivos ou gravações para demonstrar sua necessidade operacional.
          </p>
        </div>

        {/* Abas */}
        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl shrink-0">
          <button
            onClick={() => { setActiveTab('novo'); setSelectedTicket(null); }}
            className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'novo' && !selectedTicket
                ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Novo Chamado
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'historico'
                ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Histórico
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {selectedTicket ? (
          // ──── DETALHES DO CHAMADO SELECIONADO ────
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl p-6"
          >
            <button
              onClick={() => setSelectedTicket(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao Histórico
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800 mb-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${getCategoriaDetails(selectedTicket.categoria).style}`}>
                    {getCategoriaDetails(selectedTicket.categoria).label}
                  </span>
                  {getStatusBadge(selectedTicket.status)}
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    selectedTicket.prioridade === 'URGENTE' ? 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-400' :
                    selectedTicket.prioridade === 'ALTA' ? 'bg-orange-200 text-orange-950 dark:bg-orange-950/50 dark:text-orange-400' :
                    selectedTicket.prioridade === 'MEDIA' ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    Prioridade: {selectedTicket.prioridade}
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{selectedTicket.assunto}</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Aberto em {new Date(selectedTicket.createdAt).toLocaleString('pt-BR')} por {selectedTicket.usuario?.name || 'Operador'}
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descrição</h3>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl whitespace-pre-wrap border border-gray-100 dark:border-gray-800">
                {selectedTicket.descricao}
              </p>
            </div>

            {/* Anexos de Suporte no Chamado */}
            {selectedTicket.attachments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Arquivos e Gravações Anexadas ({selectedTicket.attachments.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedTicket.attachments.map((attachment) => {
                    const isAudio = attachment.tipoMime.startsWith('audio/') || attachment.nomeOriginal.endsWith('.webm') && attachment.tipoMime === 'audio/webm'
                    const isVideo = attachment.tipoMime.startsWith('video/')
                    const isImage = attachment.tipoMime.startsWith('image/')
                    const playUrl = attachment.urlPresigned || attachment.urlS3

                    return (
                      <div key={attachment.id} className="flex flex-col p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl shrink-0">
                            {isAudio ? '🎙️' : isVideo ? '📹' : isImage ? '🖼️' : '📄'}
                          </span>
                          <span className="text-xs font-semibold truncate flex-1 text-gray-900 dark:text-white" title={attachment.nomeOriginal}>
                            {attachment.nomeOriginal}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {(attachment.tamanho / 1024).toFixed(0)} KB
                          </span>
                        </div>

                        {/* Players Nativos correspondentes */}
                        {isAudio && (
                          <div className="mt-1">
                            <audio src={playUrl} controls className="w-full h-8" />
                          </div>
                        )}
                        {isVideo && (
                          <div className="mt-1 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                            <video src={playUrl} controls className="w-full max-h-48 object-contain" />
                          </div>
                        )}
                        {isImage && (
                          <div className="mt-1 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 max-h-48 flex bg-gray-100 dark:bg-gray-900">
                            <img src={playUrl} alt={attachment.nomeOriginal} className="max-h-48 w-full object-contain hover:scale-105 transition-transform duration-200 cursor-pointer" onClick={() => window.open(playUrl, '_blank')} />
                          </div>
                        )}
                        {!isAudio && !isVideo && !isImage && (
                          <a
                            href={playUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors border border-purple-200 dark:border-purple-900/40"
                          >
                            Baixar Arquivo
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        ) : activeTab === 'novo' ? (
          // ──── ABA NOVO CHAMADO ────
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl p-6 mb-12"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Seleção de Categoria (Cards Interativos) */}
              <div>
                <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-3">
                  Selecione o tipo da sua necessidade
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { id: 'DUVIDA', label: 'Dúvida Operacional', icon: HelpCircle, color: 'border-blue-200 dark:border-blue-900/30 hover:border-blue-500 bg-blue-50/10 hover:bg-blue-50/30 text-blue-500' },
                    { id: 'PROBLEMA', label: 'Problema / Erro', icon: AlertTriangle, color: 'border-red-200 dark:border-red-900/30 hover:border-red-500 bg-red-50/10 hover:bg-red-50/30 text-red-500' },
                    { id: 'SUGESTAO', label: 'Sugestão de Melhoria', icon: Lightbulb, color: 'border-amber-200 dark:border-amber-900/30 hover:border-amber-500 bg-amber-50/10 hover:bg-amber-50/30 text-amber-500' },
                    { id: 'OUTRO', label: 'Outro Assunto', icon: MoreHorizontal, color: 'border-purple-200 dark:border-purple-900/30 hover:border-purple-500 bg-purple-50/10 hover:bg-purple-50/30 text-purple-500' },
                  ].map((cat) => {
                    const Icon = cat.icon
                    const isSelected = categoria === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoria(cat.id)}
                        className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl text-center transition-all ${cat.color} ${
                          isSelected
                            ? 'border-purple-600 dark:border-purple-500 bg-purple-50/20 dark:bg-purple-950/20 scale-[1.03] shadow-lg shadow-purple-500/5'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <Icon className="w-6 h-6 mb-2" />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Assunto e Prioridade */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-2">
                    Assunto Resumido
                  </label>
                  <input
                    type="text"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    placeholder="Ex: Erro ao baixar certidão PDF no AIP"
                    className="w-full text-sm p-3 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-2">
                    Prioridade
                  </label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value)}
                    className="w-full text-sm p-3 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-gray-900 dark:text-white"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente / Impeditivo</option>
                  </select>
                </div>
              </div>

              {/* Descrição Detalhada */}
              <div>
                <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-2">
                  Descrição detalhada da sua necessidade
                </label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Explique o que ocorreu, os passos para simular ou qual é a dúvida operacional com o máximo de detalhes possível..."
                  rows={6}
                  className="w-full text-sm p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-gray-900 dark:text-white resize-none"
                />
              </div>

              {/* Seção de Gravação Integrada (Premium) */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200/50 dark:border-gray-800 flex flex-col gap-4">
                <div>
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Demonstrar o problema com mídia nativa (Opcional)</h4>
                  <p className="text-[10px] text-gray-400">Grave áudio relatando o problema ou grave a tela demonstrando o erro com poucos cliques.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  
                  {/* Botão Gravador de Áudio */}
                  {!isRecordingAudio ? (
                    <button
                      type="button"
                      onClick={startAudioRecording}
                      disabled={isRecordingScreen}
                      className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-500 hover:text-purple-600 rounded-xl flex items-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4 text-purple-500" />
                      Gravar Áudio (Microfone)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopAudioRecording}
                      className="px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl flex items-center gap-2 animate-pulse hover:scale-[1.02] transition-all"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      Parar Gravação ({formatTime(audioDuration)})
                    </button>
                  )}

                  {/* Botão Gravador de Tela */}
                  {!isRecordingScreen ? (
                    <button
                      type="button"
                      onClick={startScreenRecording}
                      disabled={isRecordingAudio}
                      className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-500 hover:text-purple-600 rounded-xl flex items-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50"
                    >
                      <Video className="w-4 h-4 text-purple-500" />
                      Gravar Tela (Screen Recording)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopScreenRecording}
                      className="px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl flex items-center gap-2 animate-pulse hover:scale-[1.02] transition-all"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      Parar Gravação ({formatTime(screenDuration)})
                    </button>
                  )}

                  {/* Seletor de Arquivos Tradicionais */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-500 hover:text-purple-600 rounded-xl flex items-center gap-2 hover:scale-[1.02] transition-all"
                  >
                    <Paperclip className="w-4 h-4 text-purple-500" />
                    Anexar Imagem ou Arquivo
                  </button>
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Exibição dos Arquivos/Gravações Preparados */}
                {selectedFiles.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-800/80 pt-3 mt-1">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Arquivos que serão enviados:</h5>
                    <div className="space-y-1.5">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 text-xs">
                          <span className="font-semibold truncate max-w-lg text-gray-800 dark:text-gray-200">
                            {file.name.startsWith('gravacao_audio') ? '🎙️ Áudio Gravado' : file.name.startsWith('gravacao_tela') ? '📹 Gravação de Tela' : file.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-400 font-medium">{(file.size / 1024).toFixed(0)} KB</span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 p-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botão de Envio */}
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={sending || isRecordingAudio || isRecordingScreen}
                  className="px-6 py-3 font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-purple-600/10"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Enviando chamado...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Enviar Chamado de Suporte
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          // ──── ABA HISTÓRICO DE CHAMADOS ────
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl mx-auto"
          >
            {loadingTickets ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                <p className="text-xs mt-2 font-medium">Carregando seus chamados...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl">
                <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">Nenhum chamado aberto</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Você não possui nenhum chamado de suporte ativo ou registrado.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 dark:hover:border-purple-500/50 rounded-2xl transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${getCategoriaDetails(ticket.categoria).style}`}>
                          {getCategoriaDetails(ticket.categoria).label}
                        </span>
                        {getStatusBadge(ticket.status)}
                        {ticket.attachments.length > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            📎 {ticket.attachments.length} anexo(s)
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate pr-4">{ticket.assunto}</h4>
                      <p className="text-xs text-gray-400">
                        Criado por {ticket.usuario?.name || 'Operador'} · {new Date(ticket.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        Visualizar Detalhes →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

    </div>
  )
}
