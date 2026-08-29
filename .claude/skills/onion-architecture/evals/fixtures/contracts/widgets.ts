// server/src/vendor/shared/contracts/widgets.ts
import { z } from 'zod';

/**
 * Widgets — a small user-facing catalogue feature. A widget carries a few
 * free-text tags; the tags are suggested by an LLM on create and can be edited.
 */

export const Widget = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});
export type Widget = z.infer<typeof Widget>;

export const CreateWidget = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).optional(),
});
export type CreateWidget = z.infer<typeof CreateWidget>;

export const WidgetsPage = z.object({
  items: z.array(Widget),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type WidgetsPage = z.infer<typeof WidgetsPage>;

export interface WidgetTagger {
  suggest(payload: import('openai').OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<string[]>;
}
