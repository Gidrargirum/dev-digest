// server/src/platform/container.ts  (excerpt — the widgets wiring added by this PR)
import type { WidgetTagger } from '@devdigest/shared';
import { OpenAiWidgetTagger } from '../adapters/llm/openai-tagger.js';
import { WidgetsService } from '../modules/widgets/service.js';

export interface ContainerOverrides {
  // ...existing fields...
  widgetTagger?: WidgetTagger;
}

// ...inside class Container...

  private _widgets?: WidgetsService;
  private _widgetTagger?: WidgetTagger;

  widgetTagger(): WidgetTagger {
    if (this.overrides.widgetTagger) return this.overrides.widgetTagger;
    this._widgetTagger ??= new OpenAiWidgetTagger();
    return this._widgetTagger;
  }

  get widgets(): WidgetsService {
    if (this.overrides.widgets) return this.overrides.widgets;
    this._widgets ??= new WidgetsService(this);
    return this._widgets;
  }
