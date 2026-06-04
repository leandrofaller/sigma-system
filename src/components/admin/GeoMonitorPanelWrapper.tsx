'use client';

import { GeoMonitorPanel } from './GeoMonitorPanel';

interface Props {
  locations: any;
  allUsers: any;
  onlineUsers: any;
}

/**
 * Wrapper que garante que os dados sempre sejam arrays válidos
 * antes de passar para o GeoMonitorPanel
 */
export function GeoMonitorPanelWrapper({ locations, allUsers, onlineUsers }: Props) {
  // Garantir que tudo é um array
  const safeLocations = Array.isArray(locations) ? locations : [];
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const safeOnlineUsers = Array.isArray(onlineUsers) ? onlineUsers : [];

  console.log('[GeoMonitorPanelWrapper] Validando dados:', {
    locationsType: typeof locations,
    locationsIsArray: Array.isArray(locations),
    locationsLength: safeLocations.length,
    allUsersType: typeof allUsers,
    allUsersIsArray: Array.isArray(allUsers),
    allUsersLength: safeAllUsers.length,
    onlineUsersType: typeof onlineUsers,
    onlineUsersIsArray: Array.isArray(onlineUsers),
    onlineUsersLength: safeOnlineUsers.length,
  });

  if (!Array.isArray(locations) || !Array.isArray(allUsers) || !Array.isArray(onlineUsers)) {
    console.error('[GeoMonitorPanelWrapper] DADOS INVÁLIDOS:', {
      locations: locations,
      allUsers: allUsers,
      onlineUsers: onlineUsers
    });
  }

  try {
    return (
      <GeoMonitorPanel
        locations={safeLocations}
        allUsers={safeAllUsers}
        onlineUsers={safeOnlineUsers}
      />
    );
  } catch (err) {
    console.error('[GeoMonitorPanelWrapper] Erro ao renderizar:', err);
    throw err;
  }
}
