import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, Context, webhookCallback } from "grammy";
import { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const bot = new Bot(env.BOT_TOKEN);

    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    const generateResponse = async (prompt: string): Promise<string> => {
      const response = await generateText({ model, prompt });
      return response.text;
    };

    const handleMessageText = async (ctx: Context): Promise<void> => {
      const userMessage = ctx.message?.text;

      if (userMessage) {
        await ctx.replyWithChatAction("typing");
        try {
          const response = await generateResponse(userMessage);
          await ctx.reply(response);
        } catch (err) {
          await ctx.reply("Something wrong: " + (err as Error).message);
        }
      }
    };

    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
