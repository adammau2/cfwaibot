import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";
import { Bot, Context, webhookCallback, session, SessionFlavor } from "grammy";

interface SessionData {
  context: string[];
}

interface MyContext extends Context, SessionFlavor<SessionData> {}

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
    const bot = new Bot<MyContext>(env.BOT_TOKEN, {
      botInfo: JSON.parse(env.BOT_INFO)
    });

    bot.use(session({ initial: () => ({ context: [] }) }));

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
      await ctx.reply("Session has been reset!");
    }

    bot.command("reset", handleReset);
    bot.on("message:text", handleMessageText);

    return webhookCallback(bot, "cloudflare-mod")(request);
  }
};
