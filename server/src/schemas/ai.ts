import { z } from 'zod';

const MAX_QUESTION = 2000;
const MAX_CONTEXT_CHARS = 22000;

export const aiRequestSchema = z
  .object({
    mode: z.enum(['analyze', 'chat', 'strategy', 'explain']),
    question: z.string().trim().min(1, 'Question is required').max(MAX_QUESTION),
    style: z.enum(['simple', 'balanced', 'advanced']).default('balanced'),
    context: z.record(z.unknown()).default({}),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
      .max(12)
      .optional(),
  })
  .refine((r) => JSON.stringify(r.context).length <= MAX_CONTEXT_CHARS, { message: `Context too large (max ${MAX_CONTEXT_CHARS} chars)`, path: ['context'] });

export type AIRequestBody = z.infer<typeof aiRequestSchema>;

const strList = z.array(z.string().max(600)).max(12).catch([]);

/** Model output is untrusted: coerce into the expected shape and drop anything else. */
export const analysisSchema = z.object({
  summary: z.string().max(2000).catch('No summary returned.'),
  bias: z.enum(['bullish', 'bearish', 'neutral', 'conflicting', 'insufficient_data']).catch('insufficient_data'),
  supportingFactors: strList,
  opposingFactors: strList,
  technicalObservations: strList,
  assetDrivers: strList,
  newsAndEvents: strList,
  macroContext: strList,
  risks: strList,
  invalidationConditions: strList,
  missingData: strList,
  assumptions: strList,
  communityView: strList,
  reasoning: strList,
});

export const strategyOutputSchema = z.object({
  supported: z.boolean().catch(false),
  explanation: z.string().max(1500).catch(''),
  logic: z.enum(['AND', 'OR']).catch('AND'),
  rules: z
    .array(z.object({ type: z.string().max(40), params: z.record(z.number()).catch({}) }))
    .max(10)
    .catch([]),
  unsupportedParts: strList,
});
