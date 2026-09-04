import { readFile, writeFile } from 'node:fs/promises';

import { requestOpenAIChat } from '../src/openai-client.ts';
import { generateWordExplanation } from '../src/word-explanation.ts';

const DEFAULT_API_BASE = 'https://poortaal-api.weilin1990.workers.dev';

function parseArgs(argv) {
  let live = false;
  let output = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') {
      live = true;
      continue;
    }
    if (arg === '--output') {
      output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (argv.includes('--output') && !output) {
    throw new Error('--output requires a file path');
  }

  return { live, output };
}

function assertStringArray(value, field, caseId) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Invalid ${field} for eval case ${caseId}`);
  }
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.cases)) {
    throw new Error('Eval dataset must contain a cases array');
  }

  for (const evalCase of dataset.cases) {
    if (!evalCase || typeof evalCase !== 'object') {
      throw new Error('Eval case must be an object');
    }
    if (typeof evalCase.id !== 'string' || typeof evalCase.input !== 'string') {
      throw new Error('Each eval case must have string id and input fields');
    }
    assertStringArray(evalCase.reference_facts, 'reference_facts', evalCase.id);
    assertStringArray(evalCase.critical_failures, 'critical_failures', evalCase.id);
    assertStringArray(evalCase.quality_criteria, 'quality_criteria', evalCase.id);
  }

  return dataset;
}

function bulletList(items) {
  return items.map(item => `- ${item}`).join('\n');
}

function renderCaseResult(result) {
  const { evalCase, explanation, error } = result;
  const modelOutput = explanation
    ? `\`\`\`json\n${JSON.stringify(explanation, null, 2)}\n\`\`\``
    : `Generation failed: ${error}`;

  return `## ${evalCase.input}\n\n**Case:** \`${evalCase.id}\`  \n**Risk:** ${evalCase.risk}\n\n### Model output\n\n${modelOutput}\n\n### Reference facts\n\n${bulletList(evalCase.reference_facts)}\n\n### Critical failures\n\n${bulletList(evalCase.critical_failures)}\n\n### Quality criteria\n\n${bulletList(evalCase.quality_criteria)}\n\n### Human rating\n\n- [ ] PASS\n- [ ] NEEDS_REVIEW\n- [ ] FAIL\n\n**Reviewer notes:**\n\n---`;
}

function renderReport(dataset, results, apiBase) {
  return `# Poortaal word explanation eval report\n\nGenerated: ${new Date().toISOString()}  \nDataset version: ${dataset.version}  \nAPI base: ${apiBase}\n\nThis report deliberately does not assign an automatic score. Review each model output against the factual gates and softer quality criteria below.\n\n${results.map(renderCaseResult).join('\n\n')}\n`;
}

const { live, output } = parseArgs(process.argv.slice(2));
const datasetUrl = new URL('./word-explanation-cases.json', import.meta.url);
const dataset = validateDataset(JSON.parse(await readFile(datasetUrl, 'utf8')));

if (!live) {
  console.log(`Loaded ${dataset.cases.length} word-explanation eval cases:`);
  for (const evalCase of dataset.cases) {
    console.log(`- ${evalCase.input} (${evalCase.id})`);
  }
  console.log('\nDry run only. Add --live to generate fresh AI outputs.');
  process.exit(0);
}

const apiBase = process.env.POORTAAL_API_BASE ?? DEFAULT_API_BASE;
const results = [];

for (const evalCase of dataset.cases) {
  console.error(`Generating explanation for ${evalCase.input}...`);
  try {
    const explanation = await generateWordExplanation(
      evalCase.input,
      (messages, temperature) => requestOpenAIChat(apiBase, messages, temperature),
    );
    results.push({ evalCase, explanation, error: null });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    results.push({ evalCase, explanation: null, error: message });
  }
}

const report = renderReport(dataset, results, apiBase);
if (output) {
  await writeFile(output, report, 'utf8');
  console.error(`Wrote eval report to ${output}`);
} else {
  console.log(report);
}
