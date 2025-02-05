import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, Context, webhookCallback, SessionFlavor } from "grammy";

interface SessionData {
  context: string[];
}

interface MyContext extends Context, SessionFlavor<SessionData> {}

export interface Env {
  BOT_TOKEN: string;
  AI: any;
  SESSION_STORE: KVNamespace;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const bot = new Bot<MyContext>(env.BOT_TOKEN);

    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;

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

    const saveSession = async (userId: string, sessionData: SessionData) => {
      await env.SESSION_STORE.put(userId, JSON.stringify(sessionData));
    };

    const workersai = createWorkersAI({ binding: env.AI });
    const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    const generateResponse = async (prompt: string): Promise<string> => {
      const response = await generateText({ model, prompt });
      return response.text;
    };

    const handleMessageText = async (ctx: MyContext) => {
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

          await saveSession(ctx.from.id, ctx.session);
        } catch (err) {
          await ctx.reply("Something went wrong: " + (err as Error).message);
        }
      }
    };

    const handleReset = async (ctx: MyContext) => {
      ctx.session = { context: [] };
      await saveSession(ctx.from.id, ctx.session);
      await ctx.reply("Session has been reset!", {
        reply_to_message_id: ctx.msg.message_id
      });
    };

    const handleRead = async (ctx: MyContext) => {
      const response = ctx.session.context.join("\n");
      await ctx.reply("Current session: " + response, {
        reply_to_message_id: ctx.msg.message_id
      });
    };

    bot.command("reset", handleReset);
    bot.command("read", handleRead);
    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
