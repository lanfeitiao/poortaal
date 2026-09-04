import { readFileSync } from 'node:fs';

import { requestOpenAIChat } from '../src/openai-client.ts';
import {
  generateWordExplanation,
  type ChatMessage,
} from '../src/word-explanation.ts';

type EvalCase = {
  id: string;
  input: string;
  risk: string;
  reference_facts: string[];
  critical_failures: string[];
  quality_criteria: string[];
};

type EvalDataset = {
  version: number;
  purpose: string;
  cases: EvalCase[];
};

const DEFAULT_API_BASE = 'https://poortaal-api.weilin1990.workers.dev';

const dataset = JSON.parse(
  readFileSync(new URL('./word-explanation-cases.json', import.meta.url), 'utf8'),
) as EvalDataset;

const live = process.argv.includes('--live');
const apiBase = process.env.POORTAAL_API_BASE || DEFAULT_API_BASE;

function printList(title: string, items: string[]) {
  console.log(`\n${title}`);
  for (const item of items) console.log(`- ${item}`);
}

function printCaseRubric(evalCase: EvalCase) {
  console.log(`\n## ${evalCase.input} (${evalCase.id})`);
  console.log(`\nRisk: ${evalCase.risk}`);
  printList('Reference facts:', evalCase.reference_facts);
  printList('Critical failures:', evalCase.critical_failures);
  printList('Quality criteria:', evalCase.quality_criteria);
}

function printDryRun() {
  console.log(`Poortaal word-explanation evals (dataset v${dataset.version})`);
  console.log(dataset.purpose);
  console.log('\nDry run only — no AI requests were sent.');

  for (const evalCase of dataset.cases) printCaseRubric(evalCase);

  console.log('\nRun `npm run eval:words -- --live` to generate current model outputs for manual review.');
}

async function runLive() {
  console.log(`Poortaal word-explanation evals (dataset v${dataset.version})`);
  console.log(`Using API: ${apiBase}`);
  console.log('\nReview each generated output against the rubric and label it PASS, NEEDS_REVIEW, or FAIL.');

  const completeChat = (messages: ChatMessage[], temperature?: number) =>
    requestOpenAIChat(apiBase, messages, temperature);

  for (const evalCase of dataset.cases) {
    printCaseRubric(evalCase);
    console.log('\nGenerated output:');

    try {
      const output = await generateWordExplanation(evalCase.input, completeChat);
      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      console.log(`GENERATION_ERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    }

    console.log('\nManual result: [ PASS / NEEDS_REVIEW / FAIL ]');
    console.log('\n---');
  }
}

if (live) {
  await runLive();
} else {
  printDryRun();
}
