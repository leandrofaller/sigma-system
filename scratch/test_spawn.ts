import { spawn } from 'child_process';
import { join } from 'path';

async function main() {
  const scriptPath = join(process.cwd(), 'scripts', 'arcface_index.py');
  const envPython = process.env.ARCFACE_PYTHON;
  const localVenv = process.platform === 'win32'
    ? join(process.cwd(), 'backend', '.venv', 'Scripts', 'python.exe')
    : join(process.cwd(), 'backend', '.venv', 'bin', 'python');

  console.log('Script Path:', scriptPath);
  console.log('Env ARCFACE_PYTHON:', envPython);
  console.log('Local Venv Path:', localVenv);

  const env = {
    ...process.env,
    HOME: '/tmp',
    MPLCONFIGDIR: '/tmp/.matplotlib',
    MPLBACKEND: 'Agg',
    ORT_LOGGING_LEVEL: '3',
    PYTHONWARNINGS: 'ignore',
    TQDM_DISABLE: '1',
  };

  console.log('\nTestando spawn com Local Venv...');
  const proc = spawn(localVenv, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], env });

  proc.on('error', (err) => {
    console.error('Erro no spawn:', err);
  });

  proc.stdout.on('data', (data) => {
    console.log('Stdout:', data.toString());
  });

  proc.stderr.on('data', (data) => {
    console.log('Stderr:', data.toString());
  });

  proc.on('close', (code) => {
    console.log('Processo encerrado com código:', code);
  });
  
  // Envia JSON com os dados do visitante 13715
  const uploadsDir = 'F:\\app\\uploads\\visitantes';
  const photoPaths = {
    '13715': 'F:\\app\\uploads\\visitantes\\visitante-13715.webp'
  };
  
  proc.stdin.write(JSON.stringify({ ids: ['13715'], uploads_dir: uploadsDir, photo_paths: photoPaths }));
  proc.stdin.end();
}

main().catch(console.error);
