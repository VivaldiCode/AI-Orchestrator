/**
 * Autonomous tool-call loop (MCP/Skills phase 2). Given a way to call the model
 * and a way to execute a tool, it drives the agentic conversation: call the
 * model, run any tool calls it requests against MCP, append the results, and
 * repeat — bounded by `maxToolCalls` — until the model answers without tools.
 *
 * Pure and transport-agnostic so it can be unit-tested with stubs; the wiring to
 * the dispatcher + MCP service lives in the route layer.
 */

export interface ToolCall {
  function: { name: string; arguments?: Record<string, unknown> };
}

export interface ChatMessage {
  role: string;
  content?: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
  [key: string]: unknown;
}

export interface ChatResponse {
  message?: ChatMessage;
  [key: string]: unknown;
}

export interface ToolLoopDeps {
  /** Call the model with the running message history; returns its response. */
  callModel: (messages: ChatMessage[]) => Promise<ChatResponse>;
  /** Execute one tool and return its result as text. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Hard cap on the number of tool executions. */
  maxToolCalls: number;
}

export interface ToolLoopResult {
  response: ChatResponse;
  messages: ChatMessage[];
  toolCalls: number;
}

/** Run the agentic loop and return the final model response. */
export async function runToolLoop(
  deps: ToolLoopDeps,
  initialMessages: ChatMessage[],
): Promise<ToolLoopResult> {
  const messages = [...initialMessages];
  let toolCalls = 0;

  // The +1 lets the model produce a final answer after the last allowed tool call.
  for (let turn = 0; turn <= deps.maxToolCalls; turn++) {
    const response = await deps.callModel(messages);
    const calls = response.message?.tool_calls ?? [];

    if (calls.length === 0 || toolCalls >= deps.maxToolCalls) {
      return { response, messages, toolCalls };
    }

    // Keep the assistant's tool-calling turn in the history.
    if (response.message) messages.push(response.message);

    for (const call of calls) {
      if (toolCalls >= deps.maxToolCalls) break;
      toolCalls++;
      const name = call.function?.name ?? '';
      let result: string;
      try {
        result = await deps.callTool(name, call.function?.arguments ?? {});
      } catch (err) {
        result = `Tool error: ${err instanceof Error ? err.message : 'failed'}`;
      }
      messages.push({ role: 'tool', tool_name: name, content: result });
    }
  }

  // Budget exhausted — one last call for a final answer without further tools.
  const response = await deps.callModel(messages);
  return { response, messages, toolCalls };
}
