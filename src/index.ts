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
    bot.on("message", async (ctx: Context) => {
      await ctx.replyWithChatAction("typing");
      try {
        const response = await generateText({
          model: model,
          prompt: ctx.message!.text!,
        });
        await ctx.reply(response.text);
      } catch (err) {
        await ctx.reply((err as Error).message);
      }
    });
    return webhookCallback(bot, "cloudflare-mod")(request);
  },
};
