import { spawn } from 'child_process';
import { join } from 'path';
import { getApenadosDir } from '../src/lib/storage';

const ids = [
  'cmpeoy7v4000510j8cr0kzb6j',
  'cmpeoy7vc000710j85yv5xsda'
];

// Como o script runAdvancedIndexBatch foi importado, vamos emular sua execução direta
function runTest() {
  const scriptPath = join(process.cwd(), 'scripts', 'advanced_face_index.py');
  
  // Vamos ler o diretório de uploads do .env
  const uploadsDir = join(process.cwd(), 'public'); // ou outro path. Vamos usar o path padrão do getApenadosDir
  const input = JSON.stringify({ ids, uploads_dir: join(process.cwd(), 'uploads', 'apenados') });
  
  console.log('Using script:', scriptPath);
  console.log('Input data:', input);

  const candidates = ['python3', 'python', 'py'];
  let idx = 0;

  function tryNext() {
    if (idx >= candidates.length) {
      console.error('Python não encontrado nos candidatos.');
      return;
    }
    const cmd = candidates[idx++];
    console.log(`Tentando Python: ${cmd}...`);
    
    const proc = spawn(cmd, ['-u', scriptPath], { shell: true });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdin.write(input);
    proc.stdin.end();

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      console.log(`Code: ${code}`);
      console.log(`STDOUT:\n${stdout}`);
      console.log(`STDERR:\n${stderr}`);
      if (code !== 0 && stdout.length === 0) {
        tryNext();
      }
    });
  }

  tryNext();
}

runTest();
