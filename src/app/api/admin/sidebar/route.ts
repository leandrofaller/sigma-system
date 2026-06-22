import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

const DEFAULT_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconName: 'LayoutDashboard', position: 10, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'relints', label: 'Relatórios (RELINTs)', href: '/relints', iconName: 'FileText', position: 20, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'relints-recebidos', label: 'RELINTs Recebidos', href: '/relints-recebidos', iconName: 'Inbox', position: 30, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: false },
  { key: 'debriefings', label: 'Debriefings', href: '/debriefings', iconName: 'BookOpen', position: 40, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'forca-tarefa', label: 'Força-Tarefa', href: '/forca-tarefa', iconName: 'ClipboardList', position: 50, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'missoes', label: 'Calendário de Missões', href: '/missoes', iconName: 'Calendar', position: 60, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'mural', label: 'Mural de Eventos', href: '/mural', iconName: 'CalendarDays', position: 70, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'acompanhamento', label: 'Acompanhamento', href: '/acompanhamento', iconName: 'Trello', position: 80, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'chat', label: 'Chat Interno', href: '/chat', iconName: 'MessageSquare', position: 90, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'ia', label: 'Consulta IA', href: '/ia', iconName: 'Sparkles', position: 100, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'apenados', label: 'Identificação de Apenados', href: '/apenados', iconName: 'UserCheck', position: 110, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'faccoes', label: 'Apenados & Facções', href: '/faccoes', iconName: 'Shield', position: 120, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false },
  { key: 'visitantes', label: 'Visitantes', href: '/visitantes', iconName: 'Users', position: 125, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false },
  { key: 'servidores', label: 'Servidores', href: '/servidores', iconName: 'Briefcase', position: 128, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false },
  { key: 'siaip', label: 'SIAIP', href: '/siaip', iconName: 'Database', position: 130, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'aparelhos', label: 'Celulares Recebidos', href: '/aparelhos', iconName: 'Smartphone', position: 140, roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'aip', label: 'AIP', href: '/aip', iconName: 'Brain', position: 150, roles: ['SUPER_ADMIN', 'OPERATOR'], enabled: true, isAdmin: false },
  { key: 'unidades-prisionais', label: 'Unidades Prisionais', href: '/unidades-prisionais', iconName: 'Building2', position: 160, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false },
];

const DEFAULT_ADMIN_ITEMS = [
  { key: 'admin-usuarios', label: 'Usuários', href: '/admin/usuarios', iconName: 'Users', position: 210, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-grupos', label: 'Grupos / Setores', href: '/admin/grupos', iconName: 'FolderOpen', position: 220, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-dispositivos', label: 'Dispositivos', href: '/admin/dispositivos', iconName: 'Monitor', position: 230, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-monitoramento', label: 'Monitoramento', href: '/admin/monitoramento', iconName: 'MapPin', position: 240, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-manutencao', label: 'Avisos de Manutenção', href: '/admin/manutencao', iconName: 'AlertCircle', position: 250, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-sidebar', label: 'Menu de Navegação', href: '/admin/sidebar', iconName: 'Settings', position: 265, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-auditoria', label: 'Auditoria', href: '/auditoria', iconName: 'ClipboardList', position: 260, roles: ['SUPER_ADMIN', 'ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-backups', label: 'Backups', href: '/admin/backups', iconName: 'Database', position: 270, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: true },
  { key: 'admin-configuracoes', label: 'Configurações', href: '/admin/configuracoes', iconName: 'Settings', position: 280, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: true },
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const userRole = user.role || 'OPERATOR';

  try {
    let configs = await prisma.sidebarConfig.findMany({
      orderBy: { position: 'asc' }
    });

    // Se a tabela estiver vazia, popular com as configurações padrão
    if (configs.length === 0) {
      const allDefaults = [...DEFAULT_NAV_ITEMS, ...DEFAULT_ADMIN_ITEMS];
      await prisma.sidebarConfig.createMany({
        data: allDefaults
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    // Verificação dinâmica: se a tabela já existia mas não possuía o item da sidebar, insere-o
    const hasSidebarConfig = configs.some(c => c.key === 'admin-sidebar');
    if (configs.length > 0 && !hasSidebarConfig) {
      await prisma.sidebarConfig.create({
        data: { key: 'admin-sidebar', label: 'Menu de Navegação', href: '/admin/sidebar', iconName: 'Settings', position: 265, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: true }
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    const hasVisitantesConfig = configs.some(c => c.key === 'visitantes');
    if (configs.length > 0 && !hasVisitantesConfig) {
      await prisma.sidebarConfig.create({
        data: { key: 'visitantes', label: 'Visitantes', href: '/visitantes', iconName: 'Users', position: 125, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false }
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    const hasServidoresConfig = configs.some(c => c.key === 'servidores');
    if (configs.length > 0 && !hasServidoresConfig) {
      await prisma.sidebarConfig.create({
        data: { key: 'servidores', label: 'Servidores', href: '/servidores', iconName: 'Briefcase', position: 128, roles: ['SUPER_ADMIN'], enabled: true, isAdmin: false }
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    // Atualização dinâmica: se a aba 'forca-tarefa' ainda estiver com o label antigo 'Forças-Tarefa', atualiza
    const forcaTarefaConfig = configs.find(c => c.key === 'forca-tarefa');
    if (forcaTarefaConfig && forcaTarefaConfig.label === 'Forças-Tarefa') {
      await prisma.sidebarConfig.update({
        where: { key: 'forca-tarefa' },
        data: { label: 'Força-Tarefa' }
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    // Atualização dinâmica: garante que admin-grupos tenha 'ADMIN' nas roles no banco de dados
    const adminGruposConfig = configs.find(c => c.key === 'admin-grupos');
    if (adminGruposConfig && !adminGruposConfig.roles.includes('ADMIN')) {
      const newRoles = [...adminGruposConfig.roles, 'ADMIN'];
      await prisma.sidebarConfig.update({
        where: { key: 'admin-grupos' },
        data: { roles: newRoles }
      });
      configs = await prisma.sidebarConfig.findMany({
        orderBy: { position: 'asc' }
      });
    }

    // Se for SUPER_ADMIN, retorna todos os itens para configuração completa
    if (userRole === 'SUPER_ADMIN') {
      return NextResponse.json(configs);
    }

    // Se for operador ou administrador comum, filtramos as abas habilitadas e permitidas para a role
    const filteredConfigs = configs.filter(
      (item) => item.enabled && item.roles.includes(userRole)
    );

    return NextResponse.json(filteredConfigs);
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno ao obter SidebarConfig', details: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado. Apenas SUPER_ADMIN pode gerenciar a barra lateral.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Formato inválido. "items" deve ser um array.' }, { status: 400 });
    }

    // Executamos a atualização em lote
    const updates = items.map((item: any) => 
      prisma.sidebarConfig.update({
        where: { id: item.id },
        data: {
          position: item.position,
          roles: item.roles,
          enabled: item.enabled,
          label: item.label
        }
      })
    );

    await prisma.$transaction(updates);

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE_SIDEBAR_CONFIG',
      entity: 'SidebarConfig',
      details: { info: 'Barra lateral reordenada/modificada pelo SUPER_ADMIN', updatedCount: items.length },
      request: req
    });

    const updatedConfigs = await prisma.sidebarConfig.findMany({
      orderBy: { position: 'asc' }
    });

    return NextResponse.json(updatedConfigs);
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao salvar alterações da Sidebar', details: err.message }, { status: 500 });
  }
}
