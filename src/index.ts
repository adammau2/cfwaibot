import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, webhookCallback } from "grammy";
import { Env, CustomContext, SessionData } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const bot = new Bot<CustomContext>(env.BOT_TOKEN);

    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id?.toString();

      if (userId) {
        const storedSession = await env.SESSION_STORE.get(userId);
        ctx.session = storedSession
          ? JSON.parse(storedSession)
          : { context: [] };
      } else {
        ctx.session = { context: [] };
      }
      return next();
    });

    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-2-7b-chat-int8");

    const saveSession = async (
      userId: number | undefined,
      sessionData: SessionData
    ): Promise<void> => {
      if (userId) {
        await env.SESSION_STORE.put(
          userId.toString(),
          JSON.stringify(sessionData)
        );
      }
    };

    const splitMessage = (message, maxLength = 4096): Promise<string[]> => {
      const messages = [];

      while (message.length > maxLength) {
        const splitIndex = message.lastIndexOf("\n", maxLength);
        const part =
          splitIndex !== -1
            ? message.substring(0, splitIndex)
            : message.substring(0, maxLength);

        messages.push(part);
        message = message.substring(part.length);
      }

      if (message.length > 0) {
        messages.push(message);
      }

      return messages;
    };
    const retryGenerateResponse = async (
      prompt,
      retries = 3
    ): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await generateResponse(prompt);
          return response;
        } catch (err) {
          if (
            err.message.includes("Capacity temporarily exceeded") &&
            i < retries - 1
          ) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw err;
          }
        }
      }
    };

    const generateResponse = async (prompt: string): Promise<string> => {
      const response = await generateText({ model, prompt });
      return response.text;
    };

    const handleMessageText = async (ctx: CustomContext): Promise<void> => {
      const userMessage = ctx.message?.text;

      if (userMessage) {
        await ctx.replyWithChatAction("typing");
        ctx.session.context.push(userMessage);

        if (ctx.session.context.length > 5) {
          ctx.session.context.shift();
        }

        const prompt = ctx.session.context.join("\n");

        try {
          const response = await retryGenerateResponse(prompt);

          ctx.session.context.push(response);

          const responseParts = splitMessage(response);
          for (const part of responseParts) {
            await ctx.reply(part);
          }
          await saveSession(ctx.from?.id, ctx.session);
        } catch (err) {
          await ctx.reply("Something went wrong: " + (err as Error).message);
        }
      }
    };

    const handleReset = async (ctx: CustomContext): Promise<void> => {
      ctx.session = { context: [] };
      await saveSession(ctx.from?.id, ctx.session);
      await ctx.reply("Session has been reset!");
    };

    const handleRead = async (ctx: CustomContext): Promise<void> => {
      const response = ctx.session.context.join("\n");
      await ctx.reply("Current session: " + response);
    };

    bot.command("reset", handleReset);
    bot.command("read", handleRead);
    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
