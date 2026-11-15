import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';
import { getEnvConfig } from './env.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface InvokeOptions {
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface InvokeResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function buildOpenAIMessages(messages: Message[], system?: string): OpenAIMessage[] {
  const openAiMessages: OpenAIMessage[] = [];
  if (system) {
    openAiMessages.push({ role: 'system', content: system });
  }
  for (const msg of messages) {
    openAiMessages.push({ role: msg.role, content: msg.content });
  }
  return openAiMessages;
}

function assertLlmConfigured(): ReturnType<typeof getEnvConfig> {
  const config = getEnvConfig();
  if (config.activeLlmProvider === 'none') {
    throw new Error(
      'No LLM credentials configured. Please configure AWS Bedrock (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or OpenAI (OPENAI_API_KEY) in your .env file.'
    );
  }
  return config;
}

async function invokeBedrock(
  options: InvokeOptions,
  config: ReturnType<typeof getEnvConfig>
): Promise<InvokeResult> {
  const { messages, system, temperature = 0.2 } = options;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  const client = new BedrockRuntimeClient({ region: config.awsRegion });

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    messages
  };

  if (system) {
    body.system = system;
  }

  const command = new InvokeModelCommand({
    modelId: config.bedrockModelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body)
  });

  const response = await client.send(command, {
    abortSignal: AbortSignal.timeout(config.agentTimeoutMs)
  });

  const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const content = responseBody.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    content,
    inputTokens: responseBody.usage?.input_tokens ?? 0,
    outputTokens: responseBody.usage?.output_tokens ?? 0
  };
}

function getChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

async function invokeOpenAI(
  options: InvokeOptions,
  config: ReturnType<typeof getEnvConfig>
): Promise<InvokeResult> {
  const { messages, system, temperature = 0.2 } = options;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  const response = await fetch(getChatCompletionsUrl(config.openaiBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: buildOpenAIMessages(messages, system),
      temperature,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(config.agentTimeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek/OpenAI API returned ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? '';
  return {
    content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0
  };
}

/**
 * Invokes the active LLM provider (AWS Bedrock or OpenAI) with configured timeouts.
 */
export async function invokeModel(options: InvokeOptions): Promise<InvokeResult> {
  const config = assertLlmConfigured();

  try {
    if (config.activeLlmProvider === 'bedrock') {
      return await invokeBedrock(options, config);
    }
    return await invokeOpenAI(options, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM invocation failed: ${message}`);
  }
}

/**
 * Streams text chunks from the active LLM provider (AWS Bedrock or OpenAI).
 */
export async function* invokeModelStream(options: InvokeOptions): AsyncGenerator<string> {
  const config = assertLlmConfigured();
  const { messages, system, temperature = 0.2 } = options;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  try {
    if (config.activeLlmProvider === 'bedrock') {
      const client = new BedrockRuntimeClient({ region: config.awsRegion });
      const body: Record<string, unknown> = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature,
        messages
      };

      if (system) {
        body.system = system;
      }

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: config.bedrockModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body)
      });

      const response = await client.send(command, {
        abortSignal: AbortSignal.timeout(config.agentTimeoutMs)
      });

      if (!response.body) {
        return;
      }

      for await (const event of response.body) {
        if (event.chunk?.bytes) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes)) as {
            type: string;
            delta?: { type: string; text: string };
          };

          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            yield chunk.delta.text;
          }
        }
      }
      return;
    }

    // DeepSeek / OpenAI-compatible SSE streaming
    const response = await fetch(getChatCompletionsUrl(config.openaiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: buildOpenAIMessages(messages, system),
        temperature,
        max_tokens: maxTokens,
        stream: true
      }),
      signal: AbortSignal.timeout(config.agentTimeoutMs)
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`DeepSeek/OpenAI API returned ${response.status}: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;

        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM stream invocation failed: ${message}`);
  }
}
