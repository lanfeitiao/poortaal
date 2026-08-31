import { z } from 'zod';

const nonEmptyString = z.string().refine(value => value.trim().length > 0, {
  message: 'Expected a non-empty string',
});

const WordExampleSchema = z.object({
  nl: nonEmptyString,
  en: nonEmptyString,
});

const WordExplanationSchema = z.object({
  word: nonEmptyString,
  type: nonEmptyString,
  meaning_nl: nonEmptyString,
  meaning_en: nonEmptyString,
  examples: z.array(WordExampleSchema).length(2),
  tips: nonEmptyString,
  fun_fact: z.string().nullable(),
});

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ');
}

(globalThis as any).validateWordExplanation = (value: unknown) => {
  const result = WordExplanationSchema.safeParse(value);
  if (!result.success) {
    throw new (globalThis as any).InvalidWordExplanationError(
      `Invalid word explanation: ${formatIssues(result.error)}`,
    );
  }
  return result.data;
};

(globalThis as any).WordExplanationSchema = WordExplanationSchema;
