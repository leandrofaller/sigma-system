const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\leand\\.gemini\\antigravity-ide\\brain\\5fbca10e-d40a-4aea-a53a-27405a4a973f\\media__1780631662203.jpg';
const destDir = path.join(__dirname, '..', 'assets');
const destPath = path.join(destDir, 'icon.png');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

sharp(srcPath)
  .resize(1024, 1024)
  .png()
  .toFile(destPath)
  .then(() => {
    console.log('Ícone convertido com sucesso e salvo em: ' + destPath);
  })
  .catch(err => {
    console.error('Erro ao converter imagem:', err);
    process.exit(1);
  });
