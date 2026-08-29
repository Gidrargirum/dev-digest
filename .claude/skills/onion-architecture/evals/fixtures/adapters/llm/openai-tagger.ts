// server/src/adapters/llm/openai-tagger.ts
import OpenAI from 'openai';
import type { WidgetTagger } from '@devdigest/shared';

const TAG_MODEL = 'gpt-4o-mini';

export class OpenAiWidgetTagger implements WidgetTagger {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async suggest(
    payload: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  ): Promise<string[]> {
    const res = await this.client.chat.completions.create({ ...payload, model: TAG_MODEL });
    const text = res.choices[0]?.message?.content ?? '';
    return text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
