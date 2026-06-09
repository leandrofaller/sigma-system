import fs from 'fs'
import path from 'path'

async function main() {
  const filePath = path.join('C:/Users/leand/.gemini/antigravity-ide/brain/40d12eec-d578-4e54-b959-ba58eac5e069/.system_generated/steps/367/output.txt')
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo nao existe')
    return
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  try {
    const data = JSON.parse(content)
    const logs = data.data?.logs || ''
    const lines = logs.split('\n')
    console.log('--- ULTIMAS 100 LINHAS DO LOG DE DEPLOY ---')
    console.log(lines.slice(-100).join('\n'))
  } catch (err) {
    console.error('Erro ao parsear JSON:', err)
  }
}

main()
