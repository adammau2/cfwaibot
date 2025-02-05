import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, Context, webhookCallback, session, SessionFlavor } from "grammy";

interface SessionData {
  context: string[];
}

interface MyContext extends Context, SessionFlavor<SessionData> {}

export interface Env {
  BOT_TOKEN: string;
  AI: any;
}
const sessions: Record<string, SessionData> = {};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const bot = new Bot<MyContext>(env.BOT_TOKEN);

    bot.use((ctx, next) => {
      const userId = ctx.from?.id;
      if (userId) {
        ctx.session = sessions[userId] || { context: [] };
      } else {
        ctx.session = { context: [] };
      }
      return next();
    });

    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-2-7b-chat-int8");

    async function generateResponse(prompt: string): Promise<string> {
      const response = await generateText({ model, prompt });
      return response.text;
    }

    async function handleMessageText(ctx: MyContext) {
      const userMessage = ctx.message?.text;

      if (userMessage) {
        await ctx.replyWithChatAction("typing");
        ctx.session.context.push(userMessage);
        if (ctx.session.context.length > 5) {
          ctx.session.context.shift();
        }

        const prompt = ctx.session.context.join("\n");

        try {
          const response = await generateResponse(prompt);
          ctx.session.context.push(response);
          await ctx.reply(response, {
            reply_to_message_id: ctx.msg.message_id
          });
        } catch (err) {
          await ctx.reply("Something wrong: " + (err as Error).message);
        }
      }
    }

    async function handleReset(ctx: MyContext) {
      ctx.session = { context: [] };
      await ctx.reply("Session has been reset!", {
        reply_to_message_id: ctx.msg.message_id
      });
    }
    async function handleRead(ctx: MyContext) {
      const response = ctx.session.context.join("\n");
      await ctx.reply("Current session: " + response, {
        reply_to_message_id: ctx.msg.message_id
      });
    }

    bot.command("reset", handleReset);
    bot.command("read", handleRead);
    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
