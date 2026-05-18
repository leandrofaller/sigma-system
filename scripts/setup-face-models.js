#!/usr/bin/env node
/**
 * Copia os modelos de reconhecimento facial do pacote @vladmandic/face-api
 * para public/models/face-api/ para que o browser possa carregá-los.
 *
 * Execute uma vez após instalar as dependências:
 *   node scripts/setup-face-models.js
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
const dst = path.join(__dirname, '..', 'public', 'models', 'face-api');

if (!fs.existsSync(src)) {
  console.error('Erro: @vladmandic/face-api nao encontrado em node_modules.');
  console.error('Execute: npm install @vladmandic/face-api');
  process.exit(1);
}

fs.mkdirSync(dst, { recursive: true });

const models = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

let ok = 0;
for (const file of models) {
  const srcFile = path.join(src, file);
  const dstFile = path.join(dst, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, dstFile);
    const size = (fs.statSync(dstFile).size / 1024 / 1024).toFixed(1);
    console.log(`  OK  ${file} (${size} MB)`);
    ok++;
  } else {
    console.warn(`  --  ${file} (nao encontrado)`);
  }
}

console.log(`\nPronto: ${ok}/${models.length} copiados`);
console.log(`Destino: ${dst}`);
