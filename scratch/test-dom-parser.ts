import * as cheerio from 'cheerio'

function testHeadersMapping() {
  const mockHtml = `
    <html>
      <body>
        <table id="tabela-apenados">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Código</th>
              <th>Nome</th>
              <th>Cela</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>[Foto]</td>
              <td>12345</td>
              <td>JOAO SILVA</td>
              <td>Cela A-1</td>
              <td>Preso Recambiado</td>
              <td>[Ver]</td>
            </tr>
            <tr>
              <td>[Foto]</td>
              <td>67890</td>
              <td>MARIA SOUZA</td>
              <td>Cela B-2</td>
              <td>Em Liberdade</td>
              <td>[Ver]</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `

  const $ = cheerio.load(mockHtml)
  
  // Lógica similar à injetada na página:
  const headers: string[] = []
  $('table thead th, table thead td').each((_, el) => {
    headers.push($(el).text().toUpperCase().trim())
  })

  const codigoIndex = headers.findIndex(text => 
    text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
  )
  const celaIndex = headers.findIndex(text => text === 'CELA')
  const situacaoIndex = headers.findIndex(text => 
    text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO'
  )

  console.log('Posições das colunas (0-index):')
  console.log(`Código: ${codigoIndex} (Esperado: 1)`)
  console.log(`Cela: ${celaIndex} (Esperado: 3)`)
  console.log(`Situação: ${situacaoIndex} (Esperado: 4)`)

  if (codigoIndex !== 1 || celaIndex !== 3 || situacaoIndex !== 4) {
    throw new Error('Falha na detecção dos cabeçalhos!')
  }

  // Simulação do parse das linhas:
  const rows: any[] = []
  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td, th')
    const id = parseInt($(cells[codigoIndex]).text().trim(), 10)
    const cela = $(cells[celaIndex]).text().trim()
    const situacao = $(cells[situacaoIndex]).text().trim()
    rows.push({ id, cela, situacao })
  })

  console.log('\nDados mapeados das linhas:')
  console.log(JSON.stringify(rows, null, 2))

  if (rows[0].id === 12345 && rows[0].situacao === 'Preso Recambiado' && rows[1].id === 67890 && rows[1].situacao === 'Em Liberdade') {
    console.log('\n🎉 SUCESSO! Mapeamento de colunas e dados validado localmente!')
  } else {
    throw new Error('Falha no mapeamento das linhas!')
  }
}

testHeadersMapping()
