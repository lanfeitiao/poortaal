import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'main.ts');
const outputDir = path.join(rootDir, 'public');
const outputPath = path.join(outputDir, 'app.js');

function compile() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: 'main.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    },
  });

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, result.outputText, 'utf8');
  console.log('Compiled src/main.ts -> public/app.js');
}

compile();

if (process.argv.includes('--watch')) {
  console.log('Watching src/main.ts...');
  let timer;
  fs.watch(sourcePath, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        compile();
      } catch (error) {
        console.error(error);
      }
    }, 50);
  });
}
