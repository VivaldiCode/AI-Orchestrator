import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { AdapterResult } from './types';
import { splitMessages, toOpenAIChatCompletion } from './util';

/**
 * Amazon Bedrock adapter using the unified Converse API. Translates an OpenAI
 * chat-completions request and back. Non-streaming in this scaffold.
 */
export class BedrockAdapter {
  private readonly client: BedrockRuntimeClient;

  constructor(region: string, accessKeyId?: string, secretAccessKey?: string) {
    this.client = new BedrockRuntimeClient({
      region,
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async chat(req: Record<string, unknown>, targetModel: string): Promise<AdapterResult> {
    const { system, turns } = splitMessages(
      req.messages as { role: string; content: unknown }[] | undefined,
    );
    const maxTokens = typeof req.max_tokens === 'number' ? req.max_tokens : 1024;

    const messages: Message[] = turns.map((t) => ({
      role: t.role,
      content: [{ text: t.content }],
    }));

    const res = await this.client.send(
      new ConverseCommand({
        modelId: targetModel,
        messages,
        ...(system ? { system: [{ text: system }] } : {}),
        inferenceConfig: { maxTokens },
      }),
    );

    const blocks = res.output?.message?.content ?? [];
    const text = blocks.map((b) => ('text' in b && b.text ? b.text : '')).join('');
    const promptTokens = res.usage?.inputTokens ?? null;
    const completionTokens = res.usage?.outputTokens ?? null;

    return {
      status: 200,
      body: toOpenAIChatCompletion(text, targetModel, promptTokens, completionTokens),
      promptTokens,
      completionTokens,
    };
  }
}
