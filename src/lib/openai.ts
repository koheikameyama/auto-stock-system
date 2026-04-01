/**
 * OpenAI API クライアント（gpt-4o-mini）
 *
 * 市場予想の生成に使用する薄いラッパー。
 * response_format: json_object で構造化出力を強制。
 */

import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2000,
    response_format: { type: "json_object" },
  });
  return response.choices[0]?.message?.content ?? "";
}
