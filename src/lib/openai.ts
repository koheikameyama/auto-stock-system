import OpenAI from "openai"

/**
 * OpenAIクライアントを取得する
 * ビルド時にAPIキーが存在しない問題を避けるため、遅延初期化を使用
 */
export function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}
