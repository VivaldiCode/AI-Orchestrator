import { describe, expect, it } from 'vitest';
import { extractOllamaUsage, filterRequestHeaders, modelMatches } from '../src/orchestrator/proxy';

describe('proxy helpers', () => {
  it('extracts token usage from streamed NDJSON', () => {
    const body = [
      '{"model":"llama3.2","message":{"role":"assistant","content":"Hi"},"done":false}',
      '{"model":"llama3.2","message":{"role":"assistant","content":"!"},"done":false}',
      '{"model":"llama3.2","done":true,"prompt_eval_count":11,"eval_count":7}',
      '',
    ].join('\n');
    expect(extractOllamaUsage(body)).toEqual({ promptTokens: 11, completionTokens: 7 });
  });

  it('returns nulls when no usage is present', () => {
    expect(extractOllamaUsage('not json\n{"foo":1}')).toEqual({
      promptTokens: null,
      completionTokens: null,
    });
  });

  it('matches models tag-insensitively', () => {
    expect(modelMatches('llama3.2:latest', 'llama3.2')).toBe(true);
    expect(modelMatches('llama3.2', 'llama3.2:latest')).toBe(true);
    expect(modelMatches('llama3.2', 'mistral')).toBe(false);
  });

  it('strips hop-by-hop and sensitive request headers', () => {
    const out = filterRequestHeaders({
      host: 'orchestrator.local',
      authorization: 'Bearer secret',
      cookie: 'session=abc',
      'content-type': 'application/json',
      'x-custom': 'keep-me',
    });
    expect(out).not.toHaveProperty('host');
    expect(out).not.toHaveProperty('authorization');
    expect(out).not.toHaveProperty('cookie');
    expect(out['content-type']).toBe('application/json');
    expect(out['x-custom']).toBe('keep-me');
  });
});
