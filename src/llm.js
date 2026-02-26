import OpenAI from 'openai';

function normalizeModel(model) {
  const aliases = {
    codex: 'gpt-5.3-codex',
    quality: 'gpt-5.3-codex',
    fast: 'gpt-5-mini'
  };
  return aliases[model] || model;
}

export async function askModel({ apiKey, model, prompt, endpoint }) {
  const client = new OpenAI({ apiKey, baseURL: endpoint || undefined });
  const realModel = normalizeModel(model);
  const res = await client.responses.create({
    model: realModel,
    input: prompt
  });
  return res.output_text || '';
}
