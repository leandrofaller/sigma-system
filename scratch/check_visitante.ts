import { prisma } from '../src/lib/db';
import { getApenadoPhotoPath } from '../src/lib/storage';
import fs from 'fs/promises';

async function main() {
  const targetCpf = '92571450778'; // Zumira Storche da Cruz
  const visitante = await prisma.sipeVisitante.findFirst({
    where: { cpf: targetCpf }
  });

  if (!visitante) {
    console.log('❌ Visitante não encontrada no banco.');
    return;
  }

  console.log('📌 Informações do Banco:');
  console.log(`- Nome: ${visitante.nome}`);
  console.log(`- ID: ${visitante.id}`);
  console.log(`- photoPath: ${visitante.photoPath}`);

  // Chave real encontrada no arquivo .env
  const secretKey = "dgZr35WUJolC91C+A8Sbu1pszJxYUh94heQC46Ov+b4=";

  if (visitante.photoPath) {
    const filePath = getApenadoPhotoPath(visitante.photoPath);
    console.log(`- Caminho Físico Resolvido: ${filePath}`);
    
    // Testando download da produção
    console.log('🌐 Testando download da produção com a chave de produção/local...');
    try {
      const PROD_URL = 'https://rastreio.owlnet.cloud';
      const prodPhotoUrl = `${PROD_URL}/api/sipe/visitantes/${visitante.id}/foto`;
      const res = await fetch(prodPhotoUrl, {
        headers: {
          'X-Sigma-Internal-Token': secretKey,
        },
      });
      if (res.ok) {
        console.log('✅ Conseguiu baixar da produção com sucesso (status 200)!');
        const arrayBuffer = await res.arrayBuffer();
        console.log(`- Tamanho baixado: ${arrayBuffer.byteLength} bytes`);
      } else {
        console.log(`❌ Falha no download de produção: Status ${res.status}`);
        const text = await res.text();
        console.log(`- Resposta: ${text}`);
      }
    } catch (err: any) {
      console.log(`❌ Erro de rede ao conectar na produção: ${err.message}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
