import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'us-east-1'
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface InvokeOptions {
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

interface InvokeResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export async function invokeModel(options: InvokeOptions): Promise<InvokeResult> {
  const { messages, system, temperature = 0.2, maxTokens = 4096 } = options;

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    messages
  };

  if (system) {
    body.system = system;
  }

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body)
    });

    const response = await client.send(command);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM invocation failed: ${message}`);
  }
}

export async function* invokeModelStream(options: InvokeOptions): AsyncGenerator<string> {
  const { messages, system, temperature = 0.2, maxTokens = 4096 } = options;

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    messages
  };

  if (system) {
    body.system = system;
  }

  try {
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body)
    });

    const response = await client.send(command);

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM stream invocation failed: ${message}`);
  }
}
