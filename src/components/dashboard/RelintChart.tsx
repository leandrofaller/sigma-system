'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTheme } from '@/components/providers/ThemeProvider';

interface Props {
  data: { month: string; count: number }[];
}

export function RelintChart({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const gridColor   = isDark ? '#1f2937' : '#f3f4f6';
  const tickColor   = isDark ? '#6b7280' : '#9ca3af';
  const tooltipBg   = isDark ? '#111827' : '#ffffff';
  const tooltipBdr  = isDark ? '#374151' : '#e5e7eb';
  const tooltipLabel= isDark ? '#f3f4f6' : '#111827';

  return (
    <div className="card p-6">
      <h3 className="text-base font-semibold text-title mb-1">RELINTs Produzidos</h3>
      <p className="text-sm text-subtle mb-6">Últimos 6 meses</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBdr}`,
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.2)',
            }}
            labelStyle={{ color: tooltipLabel, fontWeight: 600 }}
            itemStyle={{ color: '#6172f3' }}
          />
          <Bar dataKey="count" fill="#6172f3" radius={[6, 6, 0, 0]} name="RELINTs" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
