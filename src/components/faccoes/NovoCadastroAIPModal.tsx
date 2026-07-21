'use client'

import { useState } from 'react'
import { X, UserPlus, Upload, Camera, Loader2, ShieldAlert, FileText, MapPin, UserCheck, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface NovoCadastroAIPModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newApenado: any) => void
  faccoesOptions?: Array<{ id: string; nome: string }>
}

export function NovoCadastroAIPModal({
  isOpen,
  onClose,
  onSuccess,
  faccoesOptions = []
}: NovoCadastroAIPModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)

  // Formulário
  const [nome, setNome] = useState('')
  const [vulgo, setVulgo] = useState('')
  const [cpf, setCpf] = useState('')
  const [rg, setRg] = useState('')
  const [rji, setRji] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [sexo, setSexo] = useState('MASCULINO')
  const [estadoCivil, setEstadoCivil] = useState('Solteiro')
  const [nomeMae, setNomeMae] = useState('')
  const [nomePai, setNomePai] = useState('')
  const [telefone, setTelefone] = useState('')

  // Situação & Inteligência
  const [unidade, setUnidade] = useState('Fora do Sistema')
  const [situacao, setSituacao] = useState('Em Liberdade')
  const [facaoRealNome, setFacaoRealNome] = useState('')
  const [facaoNivel, setFacaoNivel] = useState('confirmado')
  const [facaoRelevancia, setFacaoRelevancia] = useState('Membro')

  // Endereço
  const [cidade, setCidade] = useState('Ariquemes')
  const [uf, setUf] = useState('RO')
  const [bairro, setBairro] = useState('')
  const [logradouro, setLogradouro] = useState('')

  // Anotações
  const [notasInteligencia, setNotasInteligencia] = useState('')

  if (!isOpen) return null

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 10MB')
        return
      }
      setFotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setFotoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      toast.error('Informe o nome completo da pessoa')
      return
    }

    setSalvando(true)
    const toastId = toast.loading('Salvando cadastro manual na AIP...')

    try {
      const formData = new FormData()
      formData.append('nome', nome.trim().toUpperCase())
      formData.append('vulgo', vulgo.trim().toUpperCase())
      formData.append('cpf', cpf.replace(/\D/g, ''))
      formData.append('rg', rg.trim())
      formData.append('rji', rji.trim())
      formData.append('dataNascimento', dataNascimento)
      formData.append('sexo', sexo)
      formData.append('estadoCivil', estadoCivil)
      formData.append('nomeMae', nomeMae.trim().toUpperCase())
      formData.append('nomePai', nomePai.trim().toUpperCase())
      formData.append('telefone', telefone.trim())

      formData.append('unidade', unidade.trim())
      formData.append('situacao', situacao.trim())
      formData.append('facaoRealNome', facaoRealNome)
      formData.append('facaoNivel', facaoNivel)
      formData.append('facaoRelevancia', facaoRelevancia)

      formData.append('cidade', cidade.trim())
      formData.append('uf', uf.trim())
      formData.append('bairro', bairro.trim())
      formData.append('logradouro', logradouro.trim())
      formData.append('notasInteligencia', notasInteligencia.trim())

      if (fotoFile) {
        formData.append('foto', fotoFile)
      }

      const res = await fetch('/api/aip/apenados/manual', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Erro ao realizar cadastro')
      }

      toast.success('Pessoa cadastrada com sucesso na aba AIP!', { id: toastId })
      onSuccess(data.apenado)
      onClose()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Erro ao salvar o cadastro', { id: toastId })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Novo Cadastro Manual na AIP
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Compartimentado AIP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Cadastre investigados ou pessoas de fora do SIPE. Integrado ao Reconhecimento Facial ArcFace.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-200">
          
          {/* Seção 1: Foto de Identificação */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Foto de Identificação (Reconhecimento Facial ArcFace)
              </h3>
              <span className="text-xs text-slate-400">Formatos: JPG, PNG, WebP (Máx 10MB)</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative w-32 h-36 bg-slate-900 border-2 border-dashed border-slate-700 rounded-xl overflow-hidden flex flex-col items-center justify-center text-slate-400 hover:border-purple-500/50 transition-colors group">
                {fotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Camera className="w-8 h-8 text-slate-500 group-hover:text-purple-400 transition-colors mb-1" />
                    <span className="text-[10px] text-slate-500 text-center px-2">Sem foto</span>
                  </>
                )}
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-left">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-xl cursor-pointer shadow-lg shadow-purple-900/20 transition-all active:scale-95">
                  <Upload className="w-4 h-4" />
                  {fotoFile ? 'Alterar Foto Selecionada' : 'Carregar Foto de Identificação'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFotoChange}
                    className="hidden"
                  />
                </label>

                {fotoFile && (
                  <button
                    type="button"
                    onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                    className="ml-2 text-xs text-rose-400 hover:underline"
                  >
                    Remover foto
                  </button>
                )}

                <p className="text-xs text-slate-400">
                  💡 Fotos frontais bem iluminadas ativam a geração do vetor facial 512-d ArcFace para busca por foto em todo o sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Seção 2: Dados Pessoais */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Dados Pessoais
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome Completo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: MARCOS DA SILVA PEREIRA"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Vulgo / Alcunha</label>
                <input
                  type="text"
                  value={vulgo}
                  onChange={(e) => setVulgo(e.target.value)}
                  placeholder="Ex: MARQUINHOS / CABEÇA"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CPF</label>
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="Apenas números"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">RG</label>
                <input
                  type="text"
                  value={rg}
                  onChange={(e) => setRg(e.target.value)}
                  placeholder="Número do RG"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">RJI (se houver)</label>
                <input
                  type="text"
                  value={rji}
                  onChange={(e) => setRji(e.target.value)}
                  placeholder="Código RJI"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Data de Nascimento</label>
                <input
                  type="text"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Sexo</label>
                <select
                  value={sexo}
                  onChange={(e) => setSexo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMININO">Feminino</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Estado Civil</label>
                <select
                  value={estadoCivil}
                  onChange={(e) => setEstadoCivil(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Solteiro">Solteiro(a)</option>
                  <option value="Casado">Casado(a)</option>
                  <option value="União Estável">União Estável</option>
                  <option value="Divorciado">Divorciado(a)</option>
                  <option value="Viúvo">Viúvo(a)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Mãe</label>
                <input
                  type="text"
                  value={nomeMae}
                  onChange={(e) => setNomeMae(e.target.value)}
                  placeholder="Nome completo da mãe"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Pai</label>
                <input
                  type="text"
                  value={nomePai}
                  onChange={(e) => setNomePai(e.target.value)}
                  placeholder="Nome completo do pai"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Situação & Inteligência de Facção */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Origem & Inteligência de Facção
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Origem / Unidade Sistema</label>
                <input
                  type="text"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="Ex: Fora do Sistema / Polícia Civil / Outro Estado"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Situação Jurídica/Status</label>
                <input
                  type="text"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value)}
                  placeholder="Ex: Em Liberdade / Procurado / Investigado"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Facção Real / Inteligência</label>
                <input
                  type="text"
                  value={facaoRealNome}
                  onChange={(e) => setFacaoRealNome(e.target.value)}
                  placeholder="Ex: CV / PCC / FDN / SEM FACÇÃO"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nível de Envolvimento</label>
                <select
                  value={facaoNivel}
                  onChange={(e) => setFacaoNivel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="confirmado">Confirmado</option>
                  <option value="suspeita">Suspeita</option>
                  <option value="negado">Negado / Sem vínculo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Relevância / Função</label>
                <select
                  value={facaoRelevancia}
                  onChange={(e) => setFacaoRelevancia(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Membro">Membro</option>
                  <option value="Membro de Relevancia">Membro de Relevância</option>
                  <option value="Liderança">Liderança</option>
                  <option value="Já exerceu Liderança">Já exerceu Liderança</option>
                </select>
              </div>
            </div>
          </div>

          {/* Seção 4: Endereço Residencial */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Endereço Residencial
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Cidade</label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Ex: Ariquemes"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  placeholder="RO"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bairro</label>
                <input
                  type="text"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Ex: São Luiz"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Logradouro / Rua</label>
                <input
                  type="text"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  placeholder="Rua, Av, N°"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Seção 5: Anotações de Inteligência */}
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Anotações & Informes de Inteligência
            </h3>
            <textarea
              rows={3}
              value={notasInteligencia}
              onChange={(e) => setNotasInteligencia(e.target.value)}
              placeholder="Digite aqui observações relevantes de inteligência, histórico de crimes, denúncias ou contexto..."
              className="w-full p-3 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl shadow-lg shadow-purple-900/30 transition-all active:scale-95"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Salvar Cadastro na AIP
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
