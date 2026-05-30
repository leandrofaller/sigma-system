import { createHash } from 'crypto'

const id = '7441'
const cpfComPontos = '033.543.462-21'
const cpfSemPontos = '03354346221'

function getSha1(val: string) {
  return createHash('sha1').update(val).digest('hex')
}

console.log(`SHA1 de ID "${id}": ${getSha1(id)}`)
console.log(`SHA1 de CPF com pontos "${cpfComPontos}": ${getSha1(cpfComPontos)}`)
console.log(`SHA1 de CPF sem pontos "${cpfSemPontos}": ${getSha1(cpfSemPontos)}`)

// E MD5?
function getMd5(val: string) {
  return createHash('md5').update(val).digest('hex')
}
console.log(`MD5 de ID "${id}": ${getMd5(id)}`)
console.log(`MD5 de CPF com pontos "${cpfComPontos}": ${getMd5(cpfComPontos)}`)
console.log(`MD5 de CPF sem pontos "${cpfSemPontos}": ${getMd5(cpfSemPontos)}`)
