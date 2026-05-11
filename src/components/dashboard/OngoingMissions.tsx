'use client';

import { MapPin, Users, Clock, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Mission {
  id: string;
  title: string;
  destination: string;
  startDate: Date;
  participants: string[];
  group?: { name: string; color?: string };
}

interface OngoingMissionsProps {
  missions: Mission[];
}

export function OngoingMissions({ missions }: OngoingMissionsProps) {
  if (missions.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="card-header p-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-title flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          Missões em Andamento
        </h3>
        <Link 
          href="/missoes" 
          className="text-[10px] font-bold text-sigma-600 hover:text-sigma-700 flex items-center gap-1 uppercase tracking-wider"
        >
          Ver Calendário <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {missions.map((mission, index) => (
          <motion.div 
            key={mission.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ background: mission.group?.color || '#6172f3' }} 
                  />
                  <h4 className="text-xs font-bold text-title leading-tight">{mission.title}</h4>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-body">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-sigma-500" />
                    {mission.destination}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-sigma-500" />
                    Desde {new Date(mission.startDate).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                {mission.participants.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {mission.participants.map(p => (
                      <span key={p} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[9px] font-bold rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="text-[10px] font-bold px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg border border-orange-100 dark:border-orange-900/30 whitespace-nowrap">
                EM CURSO
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
