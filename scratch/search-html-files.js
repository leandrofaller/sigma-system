const fs = require('fs');
const path = require('path');

const dirs = ['.debug-sipe', '.debug-sipe-test'];

dirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) return;

  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    if (!file.endsWith('.html')) return;

    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    const lines = content.split('\n');
    const matches = [];

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      // Ignora links do menu comum para focar apenas nas ações da página
      const isMenu = lower.includes('relatorios/busca') || 
                     lower.includes('relatorios/cadastrosunidades') || 
                     lower.includes('relatorios/movimentacoesadmin') || 
                     lower.includes('relatorios/recebimentogeral') || 
                     lower.includes('relatorios/temporarias') || 
                     lower.includes('relatorios/orientacaosexual') || 
                     lower.includes('relatorios/cadastrosbiometrias') || 
                     lower.includes('pontobiometria') || 
                     lower.includes('remicao/remicao/relatorio');
      
      if (lower.includes('ficha') || lower.includes('geral')) {
        if (!isMenu) {
          matches.push({ lineNum: idx + 1, text: line.trim().substring(0, 150) });
        }
      }
    });

    if (matches.length > 0) {
      console.log(`\n📄 Arquivo: ${dir}/${file} (${matches.length} ocorrências)`);
      matches.slice(0, 20).forEach(m => {
        console.log(`  Linha ${m.lineNum}: ${m.text}`);
      });
      if (matches.length > 20) {
        console.log(`  ... e mais ${matches.length - 20} linhas.`);
      }
    }
  });
});
