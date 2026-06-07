const { execSync } = require('child_process');

try {
  console.log("Buscando processos do Node correspondentes ao coolify-mcp...");
  // Executa o comando powershell para obter os processos e suas linhas de comando
  const output = execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"', { encoding: 'utf-8' });
  
  if (!output.trim()) {
    console.log("Nenhum processo node.exe encontrado.");
    process.exit(0);
  }

  const processes = JSON.parse(output);
  const processList = Array.isArray(processes) ? processes : [processes];
  
  let killedCount = 0;
  for (const proc of processList) {
    if (proc && proc.CommandLine && proc.CommandLine.includes('coolify-mcp')) {
      console.log(`Encontrado processo MCP Coolify: PID ${proc.ProcessId}`);
      console.log(`Linha de comando: ${proc.CommandLine}`);
      try {
        process.kill(proc.ProcessId, 'SIGTERM');
        console.log(`Processo ${proc.ProcessId} finalizado com sucesso.`);
        killedCount++;
      } catch (err) {
        console.error(`Erro ao matar o processo ${proc.ProcessId}:`, err.message);
      }
    }
  }

  if (killedCount === 0) {
    console.log("Nenhum processo ativo do coolify-mcp foi encontrado.");
  } else {
    console.log(`Total de processos finalizados: ${killedCount}. O IDE deve reiniciar o MCP automaticamente na próxima requisição.`);
  }

} catch (error) {
  console.error("Erro ao executar script:", error.message);
}
