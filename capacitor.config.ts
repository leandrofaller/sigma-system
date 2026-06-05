import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leandrofaller.sigmasystem',
  appName: 'SYGMA',
  webDir: 'public',
  server: {
    // ATENÇÃO: Substitua pelo domínio real da sua VPS / Coolify no deploy de produção.
    // Exemplo: 'https://rastreio.owlnet.cloud
    // Para testar localmente no emulador rodando 'npm run dev', você pode colocar 'http://10.0.2.2:3000' (IP do localhost visto pelo emulador Android)
    url: 'https://rastreio.owlnet.cloud',
    cleartext: true
  },
  android: {
    appendUserAgent: 'SYGMA-MOBILE'
  },
  ios: {
    appendUserAgent: 'SYGMA-MOBILE'
  }
};

export default config;
