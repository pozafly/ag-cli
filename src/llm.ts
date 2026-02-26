import OpenAI from 'openai';

interface AskModelArgs {
  apiKey: string;
  model: string;
  prompt: string;
  endpoint: string | null;
}

function normalizeModel(model: string): string {
  const aliases: Record<string, string> = {
    codex: 'gpt-5.3-codex',
    quality: 'gpt-5.3-codex',
    fast: 'gpt-5-mini'
  };
  return aliases[model] ?? model;
}

export async function askModel({ apiKey, model, prompt, endpoint }: AskModelArgs): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: endpoint ?? undefined,
    timeout: 20_000,
    maxRetries: 1
  });

  const realModel = normalizeModel(model);
  const res = await client.responses.create({
    model: realModel,
    input: prompt
  });

  const text = (res.output_text ?? '').trim();
  if (text) return text;

  const fallback = res.output
    ?.flatMap((item) => {
      if (item.type !== 'message') return [] as string[];
      return item.content
        .filter((content) => content.type === 'output_text')
        .map((content) => content.text.trim())
        .filter(Boolean);
    })
    .join('\n')
    .trim();

  return fallback || '';
}
