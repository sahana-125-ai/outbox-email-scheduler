import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "smtpPass",
      "accessToken"
    ],
    censor: "[redacted]"
  },
  ...(env.nodeEnv === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname"
          }
        }
      }
    : {})
});
