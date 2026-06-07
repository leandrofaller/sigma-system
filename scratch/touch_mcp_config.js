const fs = require('fs');
const path = require('path');

const configPath = 'C:\\Users\\leand\\.gemini\\antigravity-ide\\mcp_config.json';

try {
  console.log("Lendo mcp_config.json...");
  const content = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(content);
  
  // Apenas re-escreve de forma formatada para forçar alteração e atualização no IDE
  console.log("Re-escrevendo mcp_config.json formatado para disparar recarregamento...");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log("mcp_config.json atualizado com sucesso!");
} catch (error) {
  console.error("Erro ao tocar mcp_config.json:", error.message);
}
