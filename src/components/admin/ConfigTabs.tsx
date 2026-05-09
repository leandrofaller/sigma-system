'use client';

import { useState } from 'react';
import { Settings2, ImageIcon } from 'lucide-react';
import { ConfigPanel } from './ConfigPanel';
import { LogosPanel } from './LogosPanel';

interface Props {
  configs: Record<string, any>;
}

export function ConfigTabs({ configs }: Props) {
  const [tab, setTab] = useState<'system' | 'logos'>('system');

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('system')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'system'
              ? 'border-sigma-500 text-sigma-600 dark:text-sigma-400'
              : 'border-transparent text-subtle hover:text-body'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          Sistema
        </button>
        <button
          onClick={() => setTab('logos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'logos'
              ? 'border-sigma-500 text-sigma-600 dark:text-sigma-400'
              : 'border-transparent text-subtle hover:text-body'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Brasões do Documento
        </button>
      </div>

      {tab === 'system' ? (
        <ConfigPanel configs={configs} />
      ) : (
        <LogosPanel />
      )}
    </div>
  );
}
