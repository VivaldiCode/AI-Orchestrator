import Anthropic from '@anthropic-ai/sdk';
import type { AdapterResult } from './types';
import { splitMessages, toOpenAIChatCompletion } from './util';

/**
 * Anthropic adapter. Translates an OpenAI chat-completions request into the
 * Anthropic Messages API and back. Non-streaming in this scaffold (streaming is
 * a documented roadmap item); the OpenAI-shaped response keeps clients portable.
 */
export class AnthropicAdapter {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(req: Record<string, unknown>, targetModel: string): Promise<AdapterResult> {
    const { system, turns } = splitMessages(
      req.messages as { role: string; content: unknown }[] | undefined,
    );
    const maxTokens = typeof req.max_tokens === 'number' ? req.max_tokens : 1024;

    const res = await this.client.messages.create({
      model: targetModel,
      max_tokens: maxTokens,
      messages: turns,
      ...(system ? { system } : {}),
    });

    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const promptTokens = res.usage.input_tokens ?? null;
    const completionTokens = res.usage.output_tokens ?? null;

    return {
      status: 200,
      body: toOpenAIChatCompletion(text, targetModel, promptTokens, completionTokens),
      promptTokens,
      completionTokens,
    };
  }
}
