import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { estimateCostUsd } from './pricing.js';

export interface GenerateResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  raw: string;
  mocked: boolean;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  const useVertex = !!process.env.VERTEX_PROJECT_ID && !apiKey;
  if (!apiKey && !useVertex) return null;
  client = useVertex
    ? new GoogleGenAI({
        vertexai: true,
        project: process.env.VERTEX_PROJECT_ID,
        location: process.env.VERTEX_LOCATION ?? 'us-central1',
      })
    : new GoogleGenAI({ apiKey });
  return client;
}

/** Strip ```json fences a model sometimes adds despite instructions. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) return text.slice(first, last + 1);
  return text.trim();
}

/**
 * Call Gemini with a system prompt + user payload and validate the JSON output
 * against `schema`. If no credentials are configured, falls back to `mock(...)`
 * so local dev / the smoke test runs fully offline.
 */
export async function generateStructured<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  mock: () => T;
}): Promise<GenerateResult<T>> {
  const { model, system, user, schema, mock } = opts;
  const ai = getClient();

  if (!ai) {
    const data = schema.parse(mock());
    return {
      data,
      model: `${model} (mock)`,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      raw: JSON.stringify(data),
      mocked: true,
    };
  }

  const response = await ai.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const raw = response.text ?? '';
  const parsed = schema.parse(JSON.parse(extractJson(raw)));
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;

  return {
    data: parsed,
    model,
    inputTokens,
    outputTokens,
    totalTokens: usage?.totalTokenCount ?? inputTokens + outputTokens,
    costUsd: estimateCostUsd(model, inputTokens, outputTokens),
    raw,
    mocked: false,
  };
}
