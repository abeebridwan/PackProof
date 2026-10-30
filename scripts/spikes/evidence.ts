import { mkdir, writeFile } from 'node:fs/promises';
export async function evidence(name: string, data: unknown) {
  await mkdir('docs/packproof/evidence', { recursive: true });
  await writeFile(`docs/packproof/evidence/${name}.json`, JSON.stringify(data, null, 2) + '\n');
}
