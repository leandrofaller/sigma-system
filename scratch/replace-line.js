const fs = require('fs');

const filepath = 'src/lib/sipe-scraper.ts';
let content = fs.readFileSync(filepath, 'utf8');

const target = `                 const apenadoUnidadeNome = job.tipo === 'GLOBAL' ? null : (apenadoCache?.unidadeNome ?? job.unidadeNome)`;
const replacement = `                 const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? job.unidadeNome ?? null`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('🎉 Linha substituída com sucesso usando 17 espaços!');
} else {
  // Tenta com 16 espaços
  const target16 = `                const apenadoUnidadeNome = job.tipo === 'GLOBAL' ? null : (apenadoCache?.unidadeNome ?? job.unidadeNome)`;
  const replacement16 = `                const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? job.unidadeNome ?? null`;
  
  if (content.includes(target16)) {
    content = content.replace(target16, replacement16);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log('🎉 Linha substituída com sucesso usando 16 espaços!');
  } else {
    console.log('❌ Linha alvo não encontrada no arquivo!');
    // Vamos buscar algo parecido para diagnosticar
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('apenadoUnidadeNome = job.tipo') && idx > 900 && idx < 970) {
        console.log(`Linha ${idx + 1}: [${line}]`);
      }
    });
  }
}
