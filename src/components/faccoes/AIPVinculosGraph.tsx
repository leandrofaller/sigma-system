'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Play, 
  Pause, 
  Download, 
  Shield, 
  User, 
  Calendar, 
  FileText, 
  Network,
  Users,
  Eye,
  Info
} from 'lucide-react'
import { toast } from 'sonner'

interface AIPApenado {
  id: string
  sipeId: number
  nome: string
  vulgo?: string | null
  alcunhas?: { alcunha: string }[] | null
  photoPath?: string | null
  unidade?: string | null
  regime?: string | null
  cela?: string | null
  facaoRealNome?: string | null
  faccao?: string | null
}

interface AIPVinculo {
  id: string
  apenadoId: string
  vinculadoComId: string
  tipo: string
  forca: string
  notaVinculo: string | null
  outroApenado: AIPApenado
  direction: 'outgoing' | 'incoming'
}

interface GraphNode {
  id: string
  sipeId: number
  nome: string
  vulgo: string
  unidade: string
  regime: string
  cela: string
  facaoRealNome: string
  photoPath: string | null
  isCentral: boolean
  expanded: boolean
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
}

interface GraphLink {
  id: string
  source: string
  target: string
  tipo: string
  forca: string // 'confirmado' | 'suspeita'
  direction: 'outgoing' | 'incoming'
}

interface AIPVinculosGraphProps {
  selectedApenado: AIPApenado & { aipId?: string | null }
  initialVinculos: AIPVinculo[]
  onApenadoClick: (id: string) => void
  onFocarApenado: (sipeId: number) => void
}

export function AIPVinculosGraph({
  selectedApenado,
  initialVinculos,
  onApenadoClick,
  onFocarApenado
}: AIPVinculosGraphProps) {
  // Estados de dados locais para o Grafo (permite carregar segundo grau)
  const [nodes, setNodes] = useState<{ [id: string]: GraphNode }>({})
  const [links, setLinks] = useState<GraphLink[]>([])
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null)

  // Estados de navegação do SVG (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(0.8)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 300, y: 250 })
  
  // Estado da física
  const [physicsEnabled, setPhysicsEnabled] = useState(true)

  // Estados dos filtros
  const [filterConfirmado, setFilterConfirmado] = useState(true)
  const [filterSuspeita, setFilterSuspeita] = useState(true)
  
  // Categorias de Vínculos para filtros rápidos
  const [filterCategorias, setFilterCategorias] = useState({
    familia: true,
    faccao: true,
    rival: true,
    outros: true
  })

  // Detalhes de interação
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [contextMenuNodeId, setContextMenuNodeId] = useState<string | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Refs de controle de física e arrasto
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggedNodeIdRef = useRef<string | null>(null)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const nodesRef = useRef<{ [id: string]: GraphNode }>({})
  const linksRef = useRef<GraphLink[]>([])
  const animationFrameIdRef = useRef<number | null>(null)

  // Funções de categorização de vínculos
  const getCategoriaVinculo = (tipo: string) => {
    const t = tipo.toLowerCase()
    if (['mãe', 'pai', 'filho', 'filha', 'cônjuge', 'conjugue', 'esposa', 'esposo', 'irmão', 'irmã', 'familia', 'família', 'parente', 'companheiro', 'companheira', 'tio', 'tia', 'sobrinho', 'sobrinha', 'primo', 'prima', 'avô', 'avó', 'neto', 'neta'].some(word => t.includes(word))) {
      return 'familia'
    }
    if (['aliado', 'parceiro', 'facção', 'faccao', 'corre', 'membro', 'mesma faccao', 'mesma facção', 'liderança', 'lideranca', 'subordinado', 'comparsa', 'logístico', 'logistico', 'financeiro', 'coautor'].some(word => t.includes(word))) {
      return 'faccao'
    }
    if (['rival', 'inimigo', 'conflito', 'oposição', 'oposto', 'desafeto'].some(word => t.includes(word))) {
      return 'rival'
    }
    return 'outros'
  }

  const getCategoriaCor = (categoria: string) => {
    switch (categoria) {
      case 'familia': return '#10b981' // emerald-500
      case 'faccao': return '#a855f7'  // purple-500
      case 'rival': return '#ef4444'   // red-500
      default: return '#3b82f6'        // blue-500
    }
  }

  // Inicializar nós e links do apenado central e seus vínculos primários
  useEffect(() => {
    if (!selectedApenado) return

    const initialNodes: { [id: string]: GraphNode } = {}
    const initialLinks: GraphLink[] = []

    const centralId = selectedApenado.id
    
    // Obter vulgos legíveis
    const getVulgos = (ap: AIPApenado) => {
      if (ap.vulgo) return ap.vulgo
      if (ap.alcunhas && ap.alcunhas.length > 0) {
        return ap.alcunhas.map(a => a.alcunha).join(', ')
      }
      return ''
    }

    // Adiciona o nó central
    initialNodes[centralId] = {
      id: centralId,
      sipeId: selectedApenado.sipeId,
      nome: selectedApenado.nome,
      vulgo: getVulgos(selectedApenado) || '',
      unidade: selectedApenado.unidade || 'Sem Unidade',
      regime: selectedApenado.regime || '—',
      cela: selectedApenado.cela || '—',
      facaoRealNome: selectedApenado.facaoRealNome || selectedApenado.faccao || 'Sem Facção',
      photoPath: selectedApenado.photoPath || null,
      isCentral: true,
      expanded: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0 // Fixa o central no centro inicialmente
    }

    // Adiciona nós e conexões de primeiro grau
    initialVinculos.forEach((v, index) => {
      const outro = v.outroApenado
      if (!outro) return

      const outroId = outro.id
      
      // Cria o nó de destino caso não exista
      if (!initialNodes[outroId]) {
        // Dispor nós iniciais em círculo ao redor do centro
        const angle = (index * 2 * Math.PI) / Math.max(initialVinculos.length, 1)
        const radius = 220
        initialNodes[outroId] = {
          id: outroId,
          sipeId: outro.sipeId,
          nome: outro.nome,
          vulgo: getVulgos(outro) || '',
          unidade: outro.unidade || 'Sem Unidade',
          regime: outro.regime || '—',
          cela: outro.cela || '—',
          facaoRealNome: outro.facaoRealNome || outro.faccao || 'Sem Facção',
          photoPath: outro.photoPath || null,
          isCentral: false,
          expanded: false,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null
        }
      }

      // Adiciona a conexão
      initialLinks.push({
        id: v.id,
        source: v.direction === 'outgoing' ? centralId : outroId,
        target: v.direction === 'outgoing' ? outroId : centralId,
        tipo: v.tipo,
        forca: v.forca,
        direction: v.direction
      })
    })

    setNodes(initialNodes)
    setLinks(initialLinks)
    nodesRef.current = initialNodes
    linksRef.current = initialLinks

    // Reset de pan/zoom baseado no container
    if (containerRef.current) {
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      setPan({ x: width / 2, y: height / 2 - 20 })
      setZoom(0.85)
    }

    setPhysicsEnabled(true)
  }, [selectedApenado, initialVinculos])

  // Algoritmo simplificado de física de forças rodando em frame
  useEffect(() => {
    if (!physicsEnabled) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
      return
    }

    const tick = () => {
      const currentNodes = { ...nodesRef.current }
      const currentLinks = [...linksRef.current]
      const nodeKeys = Object.keys(currentNodes)

      if (nodeKeys.length === 0) return

      // Parâmetros da física
      const charge = -4000 // Repulsão (coulomb-like)
      const springLength = 180 // Comprimento natural da mola
      const springStrength = 0.08 // Força de mola
      const gravity = 0.015 // Força de gravidade central
      const friction = 0.82 // Amortecimento

      // 1. Força de repulsão entre todos os pares de nós
      for (let i = 0; i < nodeKeys.length; i++) {
        const nodeA = currentNodes[nodeKeys[i]]
        for (let j = i + 1; j < nodeKeys.length; j++) {
          const nodeB = currentNodes[nodeKeys[j]]
          
          const dx = nodeB.x - nodeA.x
          const dy = nodeB.y - nodeA.y
          const distSq = dx * dx + dy * dy || 1
          const dist = Math.sqrt(distSq)
          
          // Repulsão de Coulomb F = charge / distSq
          // Direção da força de repulsão
          const force = charge / distSq
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          if (nodeA.fx === null) {
            nodeA.vx += fx
            nodeA.vy += fy
          }
          if (nodeB.fx === null) {
            nodeB.vx -= fx
            nodeB.vy -= fy
          }
        }
      }

      // 2. Força de mola atrativa/repulsiva sobre conexões
      currentLinks.forEach(link => {
        const sourceNode = currentNodes[link.source]
        const targetNode = currentNodes[link.target]

        if (!sourceNode || !targetNode) return

        const dx = targetNode.x - sourceNode.x
        const dy = targetNode.y - sourceNode.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        
        // Mola de Hooke F = strength * (dist - length)
        const force = springStrength * (dist - springLength)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (sourceNode.fx === null) {
          sourceNode.vx += fx
          sourceNode.vy += fy
        }
        if (targetNode.fx === null) {
          targetNode.vx -= fx
          targetNode.vy -= fy
        }
      })

      // 3. Gravidade central atrai nós leves para (0, 0)
      nodeKeys.forEach(key => {
        const node = currentNodes[key]
        if (node.fx !== null) return

        node.vx -= node.x * gravity
        node.vy -= node.y * gravity

        // Aplica o atrito e atualiza coordenadas
        node.vx *= friction
        node.vy *= friction
        node.x += node.vx
        node.y += node.vy

        // Limites de velocidade para evitar instabilidade extrema
        const maxV = 35
        if (Math.abs(node.vx) > maxV) node.vx = Math.sign(node.vx) * maxV
        if (Math.abs(node.vy) > maxV) node.vy = Math.sign(node.vy) * maxV
      })

      // Sincroniza posições de volta para o state
      setNodes({ ...currentNodes })
      nodesRef.current = currentNodes

      animationFrameIdRef.current = requestAnimationFrame(tick)
    }

    animationFrameIdRef.current = requestAnimationFrame(tick)

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [physicsEnabled])

  // Filtragem dos Vínculos e Nós
  const visibleLinks = useMemo(() => {
    return links.filter(link => {
      // 1. Filtrar por confiança (confirmado/suspeita)
      if (link.forca === 'confirmado' && !filterConfirmado) return false
      if (link.forca === 'suspeita' && !filterSuspeita) return false

      // 2. Filtrar por categoria de relacionamento
      const cat = getCategoriaVinculo(link.tipo)
      if (cat === 'familia' && !filterCategorias.familia) return false
      if (cat === 'faccao' && !filterCategorias.faccao) return false
      if (cat === 'rival' && !filterCategorias.rival) return false
      if (cat === 'outros' && !filterCategorias.outros) return false

      return true
    })
  }, [links, filterConfirmado, filterSuspeita, filterCategorias])

  const visibleNodes = useMemo(() => {
    const idsVisiveis = new Set<string>()
    // O nó central deve estar sempre visível
    if (selectedApenado) {
      idsVisiveis.add(selectedApenado.id)
    }

    visibleLinks.forEach(link => {
      idsVisiveis.add(link.source)
      idsVisiveis.add(link.target)
    })

    const filtered: { [id: string]: GraphNode } = {}
    Object.keys(nodes).forEach(id => {
      if (idsVisiveis.has(id)) {
        filtered[id] = nodes[id]
      }
    })
    return filtered
  }, [nodes, visibleLinks, selectedApenado])

  // Contagem por categoria para exibição nos filtros
  const counts = useMemo(() => {
    const c = { familia: 0, faccao: 0, rival: 0, outros: 0 }
    links.forEach(l => {
      const cat = getCategoriaVinculo(l.tipo) as keyof typeof c
      if (c[cat] !== undefined) {
        c[cat]++
      } else {
        c.outros++
      }
    })
    return c
  }, [links])

  // Ações de Zoom e Pan
  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.15, Math.min(3.5, prev * factor)))
  }

  const handleResetView = () => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      setPan({ x: width / 2, y: height / 2 - 20 })
      setZoom(0.85)
    }
  }

  // Eventos de Arrasto (Pan) do plano de fundo
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === 'rect') {
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
      setContextMenuNodeId(null)
    }
  }

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // 1. Trata o Pan
    if (panStartRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      })
      return
    }

    // 2. Trata o Arrasto do Nó (Drag)
    const draggedId = draggedNodeIdRef.current
    if (draggedId) {
      const svg = svgRef.current
      if (!svg) return

      // Obter coordenadas relativas dentro do SVG
      const rect = svg.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Converte coordenadas da tela para as coordenadas locais do grafo
      // localX = (screenX - pan.x) / zoom
      const localX = (mouseX - pan.x) / zoom
      const localY = (mouseY - pan.y) / zoom

      const currentNodes = { ...nodesRef.current }
      if (currentNodes[draggedId]) {
        currentNodes[draggedId].x = localX
        currentNodes[draggedId].y = localY
        currentNodes[draggedId].fx = localX
        currentNodes[draggedId].fy = localY
        
        // Empurra posições fisicamente
        nodesRef.current = currentNodes
        setNodes({ ...currentNodes })
      }
    }
  }

  const handleSvgMouseUp = () => {
    panStartRef.current = null
    const draggedId = draggedNodeIdRef.current
    if (draggedId) {
      const currentNodes = { ...nodesRef.current }
      if (currentNodes[draggedId]) {
        // Libera o nó (retorna à física), a não ser que queiramos fixá-lo
        // Para uma melhor UX, se for o nó central a gente fixa no centro, senão libera para flutuar
        if (!currentNodes[draggedId].isCentral) {
          currentNodes[draggedId].fx = null
          currentNodes[draggedId].fy = null
        }
      }
      draggedNodeIdRef.current = null
      nodesRef.current = currentNodes
      setNodes({ ...currentNodes })
    }
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 0.85
    handleZoom(factor)
  }

  // Eventos específicos do Nó
  const handleNodeMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // Apenas arrasta com clique esquerdo
    if (e.button === 0) {
      draggedNodeIdRef.current = id
      const currentNodes = { ...nodesRef.current }
      if (currentNodes[id]) {
        currentNodes[id].fx = currentNodes[id].x
        currentNodes[id].fy = currentNodes[id].y
      }
      nodesRef.current = currentNodes
      setNodes({ ...currentNodes })
    }
  }

  const handleNodeContextMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Obter coordenadas dentro do container para renderizar menu flutuante
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setContextMenuNodeId(id)
      setContextMenuPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  // Expansão de Vínculos (Carregamento de 2º Grau)
  const handleExpandNode = async (id: string) => {
    setContextMenuNodeId(null)
    const nodeToExpand = nodes[id]
    if (!nodeToExpand) return

    setLoadingNodeId(id)
    const toastId = toast.loading(`Buscando conexões de ${nodeToExpand.nome}...`)
    
    try {
      const res = await fetch(`/api/aip/vinculos?sipeId=${nodeToExpand.sipeId}`)
      if (!res.ok) throw new Error('Erro na resposta do servidor')
      const data = await res.json()
      
      const novosVinculos: AIPVinculo[] = data.vinculos || []
      
      if (novosVinculos.length === 0) {
        toast.info(`${nodeToExpand.nome} não possui vínculos adicionais documentados.`)
        // Marca como expandido mesmo sem novos nós
        const currentNodes = { ...nodesRef.current }
        if (currentNodes[id]) {
          currentNodes[id].expanded = true
        }
        nodesRef.current = currentNodes
        setNodes({ ...currentNodes })
        return
      }

      const currentNodes = { ...nodesRef.current }
      const currentLinks = [...linksRef.current]

      // Marca o nó atual como expandido
      if (currentNodes[id]) {
        currentNodes[id].expanded = true
      }

      // Adiciona novos nós e links
      novosVinculos.forEach((v, index) => {
        const outro = v.outroApenado
        if (!outro) return

        const outroId = outro.id
        
        // Evita adicionar o nó central do grafo original se já estiver lá
        if (!currentNodes[outroId]) {
          // Espalhar nós periféricos adicionais ao redor do nó que expandiu
          const angle = nodeToExpand.expanded 
            ? Math.random() * 2 * Math.PI 
            : (index * 2 * Math.PI) / Math.max(novosVinculos.length, 1)
          const radius = 160
          
          currentNodes[outroId] = {
            id: outroId,
            sipeId: outro.sipeId,
            nome: outro.nome,
            vulgo: outro.vulgo || (outro.alcunhas && outro.alcunhas.length > 0 ? outro.alcunhas.map(a => a.alcunha).join(', ') : '') || '',
            unidade: outro.unidade || 'Sem Unidade',
            regime: outro.regime || '—',
            cela: outro.cela || '—',
            facaoRealNome: outro.facaoRealNome || outro.faccao || 'Sem Facção',
            photoPath: outro.photoPath || null,
            isCentral: false,
            expanded: false,
            // Posição inicial próxima ao pai para animação natural
            x: nodeToExpand.x + Math.cos(angle) * radius,
            y: nodeToExpand.y + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null
          }
        }

        // Verifica se a conexão já existe
        const linkExiste = currentLinks.some(l => 
          (l.source === id && l.target === outroId) || 
          (l.source === outroId && l.target === id)
        )

        if (!linkExiste) {
          currentLinks.push({
            id: v.id,
            source: v.direction === 'outgoing' ? id : outroId,
            target: v.direction === 'outgoing' ? outroId : id,
            tipo: v.tipo,
            forca: v.forca,
            direction: v.direction
          })
        }
      })

      // Atualiza referências
      nodesRef.current = currentNodes
      linksRef.current = currentLinks

      setNodes({ ...currentNodes })
      setLinks(currentLinks)

      // Garante que a física volte a rodar
      setPhysicsEnabled(true)
      toast.success(`${novosVinculos.length} vínculos de ${nodeToExpand.nome} adicionados à rede.`)

    } catch (err) {
      console.error(err)
      toast.error('Erro ao expandir rede de relacionamentos')
    } finally {
      setLoadingNodeId(null)
      toast.dismiss(toastId)
    }
  }

  // Exportar o Grafo como SVG
  const handleExportImage = () => {
    const svgEl = svgRef.current
    if (!svgEl) return

    try {
      // Cria uma cópia do SVG para podermos limpar filtros temporários ou estilizar para download
      const svgCopy = svgEl.cloneNode(true) as SVGSVGElement
      
      // Define a largura e altura explícitas para o arquivo
      svgCopy.setAttribute('width', '1000')
      svgCopy.setAttribute('height', '800')
      
      // Cria o serializer para gerar arquivo texto do SVG
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgCopy)
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const downloadLink = document.createElement('a')
      downloadLink.href = svgUrl
      downloadLink.download = `rede_vinculos_${selectedApenado.nome.toLowerCase().replace(/\s+/g, '_')}.svg`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(svgUrl)

      toast.success('Gráfico exportado em formato vetorial (.svg) com sucesso!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar imagem')
    }
  }

  // Fechar menu de contexto ao clicar em qualquer lugar
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenuNodeId(null)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Nó ativo sob o cursor
  const hoveredNode = hoveredNodeId ? nodes[hoveredNodeId] : null

  return (
    <div 
      ref={containerRef}
      className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 flex flex-col min-h-[500px] relative overflow-hidden select-none"
    >
      {/* 1. Grade Sutil de Fundo (Grid Blueprint) */}
      <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#374151_1px,transparent_1px),linear-gradient(to_bottom,#374151_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* 2. Barra de Controle Superior (Toolbar) */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-2 items-center justify-between pointer-events-none">
        
        {/* Lado Esquerdo: Filtros e Categorias */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-white/95 dark:bg-gray-800/95 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xs font-semibold text-gray-700 dark:text-gray-300">
          <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold mr-1">
            <Network className="w-3.5 h-3.5" />
            Filtros:
          </span>
          
          <label className="flex items-center gap-1 cursor-pointer hover:opacity-85 transition-opacity">
            <input 
              type="checkbox" 
              checked={filterCategorias.familia} 
              onChange={e => setFilterCategorias(prev => ({ ...prev, familia: e.target.checked }))}
              className="rounded text-emerald-500 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Família ({counts.familia})
          </label>

          <div className="h-3 w-px bg-gray-200 dark:bg-gray-700 mx-1.5" />

          <label className="flex items-center gap-1 cursor-pointer hover:opacity-85 transition-opacity">
            <input 
              type="checkbox" 
              checked={filterCategorias.faccao} 
              onChange={e => setFilterCategorias(prev => ({ ...prev, faccao: e.target.checked }))}
              className="rounded text-purple-500 focus:ring-purple-500 w-3 h-3 cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            Alianças ({counts.faccao})
          </label>

          <div className="h-3 w-px bg-gray-200 dark:bg-gray-700 mx-1.5" />

          <label className="flex items-center gap-1 cursor-pointer hover:opacity-85 transition-opacity">
            <input 
              type="checkbox" 
              checked={filterCategorias.rival} 
              onChange={e => setFilterCategorias(prev => ({ ...prev, rival: e.target.checked }))}
              className="rounded text-red-500 focus:ring-red-500 w-3 h-3 cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Rivalidades ({counts.rival})
          </label>

          <div className="h-3 w-px bg-gray-200 dark:bg-gray-700 mx-1.5" />

          <label className="flex items-center gap-1 cursor-pointer hover:opacity-85 transition-opacity">
            <input 
              type="checkbox" 
              checked={filterCategorias.outros} 
              onChange={e => setFilterCategorias(prev => ({ ...prev, outros: e.target.checked }))}
              className="rounded text-blue-500 focus:ring-blue-500 w-3 h-3 cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Outros ({counts.outros})
          </label>
        </div>

        {/* Lado Direito: Ações da Câmera, Física e Exportar */}
        <div className="flex items-center gap-2 pointer-events-auto bg-white/95 dark:bg-gray-800/95 backdrop-blur-md p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          
          {/* Confiança */}
          <div className="flex items-center gap-2 px-2 text-[10px] uppercase font-bold border-r border-gray-200 dark:border-gray-700 mr-1 text-gray-500 dark:text-gray-400">
            <label className="flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-white">
              <input 
                type="checkbox" 
                checked={filterConfirmado} 
                onChange={e => setFilterConfirmado(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500" 
              />
              Confirmados
            </label>
            <label className="flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-white">
              <input 
                type="checkbox" 
                checked={filterSuspeita} 
                onChange={e => setFilterSuspeita(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500" 
              />
              Suspeitos
            </label>
          </div>

          <button
            type="button"
            onClick={() => setPhysicsEnabled(!physicsEnabled)}
            className={`p-1.5 rounded-lg transition-colors border ${
              physicsEnabled 
                ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:border-purple-900/40 dark:text-purple-400' 
                : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-900 dark:border-gray-750 dark:text-gray-400'
            }`}
            title={physicsEnabled ? 'Pausar simulação física' : 'Ativar simulação física'}
          >
            {physicsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => handleZoom(1.2)}
            className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleZoom(0.8)}
            className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
            title="Diminuir Zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            className="p-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
            title="Redefinir Câmera (Centralizar)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleExportImage}
            className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-1 text-xs font-semibold px-2.5"
            title="Exportar gráfico de vínculos para relatórios"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* 3. Área SVG do Grafo */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing min-h-[500px]"
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          {/* Marcadores de Seta para as Linhas de Relações */}
          <marker id="arrow-incoming" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
          </marker>
          <marker id="arrow-outgoing" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
          </marker>
          
          {/* Padrões de imagem para fotos dos apenados */}
          {Object.values(visibleNodes).map(node => (
            <pattern
              key={`pat-${node.id}`}
              id={`photo-pat-${node.id}`}
              patternUnits="objectBoundingBox"
              x="0"
              y="0"
              width="1"
              height="1"
            >
              {node.photoPath ? (
                <image
                  href={node.isCentral 
                    ? `/api/sipe/apenados/${node.id}/foto` 
                    : `/api/aip/apenados/${node.id}/foto`
                  }
                  x="0"
                  y="0"
                  width={node.isCentral ? "60" : "44"}
                  height={node.isCentral ? "60" : "44"}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <rect 
                  width={node.isCentral ? "60" : "44"} 
                  height={node.isCentral ? "60" : "44"} 
                  fill="#cbd5e1" 
                />
              )}
            </pattern>
          ))}
        </defs>

        {/* Fundo clicável */}
        <rect width="100%" height="100%" fill="transparent" />

        {/* Grupo SVG Transformável (Pan & Zoom) */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          
          {/* 3.1. Renderização das Arestas/Conexões (Links) */}
          <g>
            {visibleLinks.map(link => {
              const sourceNode = visibleNodes[link.source]
              const targetNode = visibleNodes[link.target]
              
              if (!sourceNode || !targetNode) return null

              const cat = getCategoriaVinculo(link.tipo)
              const color = getCategoriaCor(cat)
              
              // Define o tipo de linha (Suspeito = tracejado, Confirmado = Sólido)
              const isConfirmado = link.forca === 'confirmado'
              
              // Calcula o ponto médio para o texto
              const midX = (sourceNode.x + targetNode.x) / 2
              const midY = (sourceNode.y + targetNode.y) / 2

              // Rotação do texto para alinhar com a linha
              const dx = targetNode.x - sourceNode.x
              const dy = targetNode.y - sourceNode.y
              let angle = (Math.atan2(dy, dx) * 180) / Math.PI
              if (angle > 90 || angle < -90) {
                angle += 180 // Evita texto de cabeça para baixo
              }

              return (
                <g key={`link-g-${link.id}`} className="transition-opacity duration-300">
                  {/* Linha de Conexão */}
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={color}
                    strokeWidth={isConfirmado ? 2.5 : 1.5}
                    strokeDasharray={isConfirmado ? "0" : "4, 4"}
                    opacity={hoveredNodeId === link.source || hoveredNodeId === link.target ? 0.95 : 0.45}
                    markerEnd={`url(#arrow-outgoing)`}
                    className={isConfirmado ? "animate-[dash_10s_linear_infinite]" : ""}
                  />

                  {/* Linha Invisível mais grossa para facilitar o hover e exibir tooltip */}
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="transparent"
                    strokeWidth={15}
                    className="cursor-pointer"
                    title={`${link.tipo} (${isConfirmado ? 'Confirmado' : 'Suspeito'})`}
                  />

                  {/* Etiqueta de Texto do Tipo de Vínculo sobre a Linha */}
                  <g transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
                    <rect
                      x={-42}
                      y={-8}
                      width={84}
                      height={14}
                      rx={3}
                      fill={color}
                      opacity={hoveredNodeId === link.source || hoveredNodeId === link.target ? 0.95 : 0.8}
                      className="transition-all"
                    />
                    <text
                      textAnchor="middle"
                      y={2}
                      fill="#ffffff"
                      fontSize="8px"
                      fontWeight="bold"
                      className="pointer-events-none uppercase tracking-wide select-none"
                    >
                      {link.tipo.length > 15 ? `${link.tipo.substring(0, 13)}...` : link.tipo}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>

          {/* 3.2. Renderização dos Nós (Apenados/Entidades) */}
          <g>
            {Object.values(visibleNodes).map(node => {
              const borderSize = node.isCentral ? 4 : 2
              const nodeRadius = node.isCentral ? 30 : 22
              
              // Descobre a cor da borda baseado no vínculo principal dele (ou roxo se for central)
              let nodeColor = '#a855f7' // roxo padrão para central
              if (!node.isCentral) {
                const linkComCentral = links.find(l => 
                  (l.source === node.id || l.target === node.id)
                )
                if (linkComCentral) {
                  const cat = getCategoriaVinculo(linkComCentral.tipo)
                  nodeColor = getCategoriaCor(cat)
                }
              }

              const isHovered = hoveredNodeId === node.id
              const isDragged = draggedNodeIdRef.current === node.id
              
              return (
                <g
                  key={`node-g-${node.id}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                  onContextMenu={(e) => handleNodeContextMenu(node.id, e)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-grab active:cursor-grabbing transition-opacity duration-300"
                  style={{ opacity: hoveredNodeId && hoveredNodeId !== node.id ? 0.6 : 1 }}
                >
                  {/* Sombra Glow de Destaque */}
                  <circle
                    r={nodeRadius + 4}
                    fill={nodeColor}
                    opacity={isHovered || isDragged ? 0.35 : node.isCentral ? 0.15 : 0}
                    className="transition-all duration-300"
                    style={{
                      filter: 'blur(3px)'
                    }}
                  />

                  {/* Círculo Principal com Foto do Apenado */}
                  <circle
                    r={nodeRadius}
                    fill={`url(#photo-pat-${node.id})`}
                    stroke={nodeColor}
                    strokeWidth={borderSize}
                    className="transition-all duration-200"
                  />

                  {/* Indicador de "Pendente" ou "Expandido" */}
                  {node.expanded && !node.isCentral && (
                    <circle
                      cx={nodeRadius - 2}
                      cy={-nodeRadius + 2}
                      r={4}
                      fill="#10b981"
                      stroke="#ffffff"
                      strokeWidth={1}
                      title="Totalmente Expandido"
                    />
                  )}

                  {loadingNodeId === node.id && (
                    <circle
                      cx={0}
                      cy={0}
                      r={nodeRadius + 1}
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth={3}
                      strokeDasharray="5, 3"
                      className="animate-spin"
                    />
                  )}

                  {/* Texto de Identificação abaixo do nó */}
                  <g transform={`translate(0, ${nodeRadius + 14})`}>
                    {/* Retângulo de Fundo para o Nome do Nó */}
                    <rect
                      x={-70}
                      y={-11}
                      width={140}
                      height={27}
                      rx={6}
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth={1.5}
                      className="fill-white dark:fill-slate-800 stroke-slate-200 dark:stroke-slate-700 shadow-sm transition-all"
                    />
                    
                    {/* Nome do Apenado */}
                    <text
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="9px"
                      fontWeight="bold"
                      className="fill-slate-900 dark:fill-slate-100 pointer-events-none uppercase font-sans select-none"
                    >
                      {node.nome.length > 20 ? `${node.nome.substring(0, 18)}...` : node.nome}
                    </text>

                    {/* Vulgo (Se houver) */}
                    {node.vulgo && (
                      <text
                        textAnchor="middle"
                        y={10}
                        fill="#7c3aed"
                        fontSize="7.5px"
                        fontWeight="bold"
                        className="fill-purple-600 dark:fill-purple-400 pointer-events-none italic select-none"
                      >
                        Vulgo: {node.vulgo.length > 20 ? `${node.vulgo.substring(0, 18)}...` : node.vulgo}
                      </text>
                    )}
                  </g>
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {/* 4. Caixa Flutuante de Detalhes (Tooltip Elegante) */}
      {hoveredNode && (
        <div 
          className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-sm bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200 dark:border-gray-700 p-3.5 rounded-2xl shadow-xl z-20 flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none text-xs"
        >
          {/* Foto Miniatura */}
          <div className="w-12 h-16 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-gray-400">
            {hoveredNode.photoPath ? (
              <img 
                src={hoveredNode.isCentral 
                  ? `/api/sipe/apenados/${hoveredNode.id}/foto` 
                  : `/api/aip/apenados/${hoveredNode.id}/foto`
                }
                alt={hoveredNode.nome}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6" />
            )}
          </div>

          {/* Dados do Apenado */}
          <div className="flex-1 min-w-0 space-y-1">
            <h5 className="font-bold text-gray-900 dark:text-white truncate uppercase text-[11px] leading-snug">{hoveredNode.nome}</h5>
            {hoveredNode.vulgo && (
              <p className="text-[10px] text-purple-600 dark:text-purple-400 font-bold italic">Vulgo: {hoveredNode.vulgo}</p>
            )}
            
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
              <span className="truncate"><strong className="text-gray-700 dark:text-gray-300">Custódia:</strong> {hoveredNode.unidade}</span>
              <span><strong className="text-gray-700 dark:text-gray-300">Regime:</strong> {hoveredNode.regime}</span>
              <span><strong className="text-gray-700 dark:text-gray-300">Cela:</strong> {hoveredNode.cela}</span>
              <span className="truncate flex items-center gap-0.5 font-semibold text-purple-700 dark:text-purple-400">
                <Shield className="w-2.5 h-2.5 shrink-0" /> {hoveredNode.facaoRealNome}
              </span>
            </div>
            
            {/* Informações da Relação se não for central */}
            {!hoveredNode.isCentral && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-800 text-[10px]">
                {(() => {
                  const link = links.find(l => 
                    (l.source === hoveredNode.id || l.target === hoveredNode.id)
                  )
                  if (!link) return null
                  const isConfirmado = link.forca === 'confirmado'
                  return (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="font-bold text-gray-600 dark:text-gray-400">Relação:</span>
                      <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 font-bold rounded">
                        {link.tipo}
                      </span>
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase ${
                        isConfirmado 
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400' 
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                      }`}>
                        {isConfirmado ? 'Confirmado' : 'Suspeita'}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Menu Flutuante de Ações do Nó (Context Menu) */}
      {contextMenuNodeId && (
        <div
          className="absolute bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 z-30 min-w-[160px] animate-in zoom-in-95 duration-100 divide-y divide-gray-100 dark:divide-gray-800"
          style={{
            top: contextMenuPos.y,
            left: contextMenuPos.x
          }}
          onClick={(e) => e.stopPropagation()} // impede fechar ao clicar nos botões
        >
          <div className="px-3 py-1.5 text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">
            Ações de Investigação
          </div>

          <button
            type="button"
            onClick={() => {
              onApenadoClick(contextMenuNodeId)
              setContextMenuNodeId(null)
            }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            Ver Ficha Completa
          </button>

          {nodes[contextMenuNodeId] && !nodes[contextMenuNodeId].isCentral && (
            <>
              <button
                type="button"
                onClick={() => {
                  onFocarApenado(nodes[contextMenuNodeId].sipeId)
                  setContextMenuNodeId(null)
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Eye className="w-3.5 h-3.5 text-purple-500" />
                Focar como Central
              </button>

              <button
                type="button"
                disabled={nodes[contextMenuNodeId].expanded}
                onClick={() => handleExpandNode(contextMenuNodeId)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50"
              >
                <Network className="w-3.5 h-3.5 text-emerald-500" />
                {nodes[contextMenuNodeId].expanded ? 'Já Expandido (2º Grau)' : 'Expandir Vínculos (2º Grau)'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 6. Indicadores Informativos de Ajuda */}
      <div className="absolute bottom-4 right-4 pointer-events-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm text-[10px] text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-purple-500" />
        <span>Arraste nós com botão esquerdo. Clique com botão direito para ver opções de expansão.</span>
      </div>
    </div>
  )
}
