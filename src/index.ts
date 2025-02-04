import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, Context, webhookCallback } from "grammy";

export interface Env {
  BOT_INFO: string;
  BOT_TOKEN: string;
  AI: any;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const bot = new Bot(env.BOT_TOKEN, { botInfo: JSON.parse(env.BOT_INFO) });
    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-2-7b-chat-int8");

    async function generateResponse(prompt: string): Promise<string> {
      const response = await generateText({
        model: model,
        prompt: prompt
      });
      return response.text;
    }

    async function handleMessageText(ctx: Context) {
      await ctx.replyWithChatAction("typing");
      const userMessage = ctx.message?.text;

      if (userMessage) {
        try {
          const response = await generateResponse(userMessage);
          await ctx.reply(response, {
            reply_to_message_id: ctx.msg.message_id
          });
        } catch (err) {
          await ctx.reply((err as Error).message);
        }
      }
    }

    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
