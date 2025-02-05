import { Context, SessionFlavor } from "grammy";
import { SessionData } from "./sessiondata";

export interface CustomContext extends Context, SessionFlavor<SessionData> {}
