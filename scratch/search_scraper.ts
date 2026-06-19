import { readFile } from 'fs/promises';
import { join } from 'path';

async function main() {
  const filePath = join(process.cwd(), 'src', 'lib', 'sipe-scraper.ts');
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');

  console.log(`Total lines: ${lines.length}`);

  // Search for startSipeSync
  lines.forEach((line, idx) => {
    if (line.includes('export function startSipeSync') || line.includes('export async function startSipeSync')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  });
}

main().catch(console.error);
