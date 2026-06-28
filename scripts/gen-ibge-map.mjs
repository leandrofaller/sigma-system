import { readFileSync, writeFileSync } from 'fs'
const d = JSON.parse(readFileSync('public/geo/municipios-ibge.json', 'utf8'))
const lines = d.map((m) => `  ${m.id}: ${JSON.stringify(m.nome)},`)
const out = `/** Gerado de public/geo/municipios-ibge.json — não editar manualmente */\nexport const IBGE_PARA_NOME: Record<number, string> = {\n${lines.join('\n')}\n}\n`
writeFileSync('src/lib/ibge-rondonia.generated.ts', out)
console.log('OK', d.length, 'municipios')