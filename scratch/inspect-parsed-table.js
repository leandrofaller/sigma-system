const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

async function inspectParsedTable() {
  const htmlPath = path.join(__dirname, 'ficha-geral-post-real.html')
  if (!fs.existsSync(htmlPath)) {
    console.error('Arquivo ficha-geral-post-real.html não encontrado!')
    return
  }

  const html = fs.readFileSync(htmlPath, 'utf-8')
  
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setContent(html)

  const tablesData = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'))
    return tables.map((table, idx) => {
      // Coleta todas as linhas
      const trs = Array.from(table.querySelectorAll('tr'))
      
      const rows = trs.map((tr, trIdx) => {
        const ths = Array.from(tr.querySelectorAll('th')).map(el => el.textContent?.trim() || '')
        const tds = Array.from(tr.querySelectorAll('td')).map(el => {
          // Captura links e inputs se houver
          return el.textContent?.trim() || ''
        })
        
        return {
          trIdx,
          isHeader: ths.length > 0,
          cells: ths.length > 0 ? ths : tds,
          html: tr.innerHTML.substring(0, 300)
        }
      })

      return {
        tableIndex: idx,
        rows
      }
    })
  })

  console.log(`Encontradas ${tablesData.length} tabelas.`)
  
  tablesData.forEach(t => {
    console.log(`\n================ TABELA INDEX ${t.tableIndex} ================`)
    t.rows.forEach(r => {
      const type = r.isHeader ? '[HEADER]' : '[ROW]   '
      console.log(`${type} Linha ${r.trIdx}: ${JSON.stringify(r.cells)}`)
    })
  })

  await browser.close()
}

inspectParsedTable()
