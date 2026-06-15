import * as fs from 'fs/promises'
import * as cheerio from 'cheerio'

async function main() {
  const html = await fs.readFile('scratch_ficha_geral_zaqueu_all.html', 'utf8')
  const $ = cheerio.load(html)

  console.log('=== EXTRAINDO ADVOGADOS ===')
  $('div.title').each((_, elem) => {
    const text = $(elem).text().toUpperCase()
    if (text.includes('ADVOGADOS CADASTRADOS')) {
      let next = $(elem).next()
      while (next.length && next.hasClass('line')) {
        const line = next
        const photoSrc = line.find('img').attr('src') || null
        const fields: Record<string, string> = {}
        
        line.find('.input').each((_, inputElem) => {
          const label = $(inputElem).find('label').text().trim().toUpperCase()
          const value = $(inputElem).find('input').val()?.toString().trim() || $(inputElem).find('input').attr('value')?.trim() || ''
          if (label) {
            fields[label] = value
          }
        })
        
        console.log({
          photoSrc,
          nome: fields['NOME DO ADVOGADO'] || fields['NOME'],
          oab: fields['OAB'],
          dataCadastro: fields['DATA DE CADASTRO'],
          telefone: fields['TELEFONE DE CONTATO'],
          situacao: fields['SITUAÇÃO'] || fields['SITUACAO']
        })
        
        next = next.next()
      }
    }
  })

  console.log('\n=== EXTRAINDO VISITANTES ===')
  $('div.title').each((_, elem) => {
    const text = $(elem).text().toUpperCase()
    if (text.includes('VISITANTES CADASTRADAS') || text.includes('VISITANTES CADASTRADOS')) {
      let next = $(elem).next()
      while (next.length && next.hasClass('line')) {
        const line = next
        const photoSrc = line.find('img').attr('src') || null
        const fields: Record<string, string> = {}
        
        line.find('.input').each((_, inputElem) => {
          const label = $(inputElem).find('label').text().trim().toUpperCase()
          const value = $(inputElem).find('input').val()?.toString().trim() || $(inputElem).find('input').attr('value')?.trim() || ''
          if (label) {
            fields[label] = value
          }
        })
        
        // Vamos procurar chaves de forma mais flexivel
        const labelNome = Object.keys(fields).find(k => k.includes('NOME')) || 'NOME DA VISITANTE'
        const labelParentesco = Object.keys(fields).find(k => k.includes('PARENTESCO') || k.includes('VINCULO')) || 'GRAU PARENTESCO'
        const labelCarteirinha = Object.keys(fields).find(k => k.includes('CARTEIRINHA')) || 'DATA DA CARTEIRINHA'
        const labelEndereco = Object.keys(fields).find(k => k.includes('ENDEREÇO') || k.includes('ENDERECO')) || 'ENDEREÇO'
        const labelSituacao = Object.keys(fields).find(k => k.includes('SITUAÇÃO') || k.includes('SITUACAO')) || 'SITUAÇÃO'

        console.log({
          photoSrc,
          nome: fields[labelNome],
          cpf: fields['CPF'],
          rg: fields['RG'],
          dataNascimento: fields['DATA DE NASCIMENTO'],
          parentesco: fields[labelParentesco],
          carteirinha: fields[labelCarteirinha],
          endereco: fields[labelEndereco],
          situacao: fields[labelSituacao]
        })
        
        next = next.next()
      }
    }
  })
}

main().catch(console.error)

