import { z } from "zod";

const blankAsUndefined = (value: unknown) => value === "" ? undefined : value;

const environmentSchema = z.object({
  PORT: z.preprocess(blankAsUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PUBLIC_BASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  WHATSAPP_API_VERSION: z.preprocess(blankAsUndefined, z.string().regex(/^v\d+\.\d+$/).default("v25.0")),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  PULSE_WHATSAPP_NUMBER: z.string().min(1),
  PAYAZA_PUBLIC_KEY_TEST: z.string().min(1),
  PAYAZA_SECRET_KEY_TEST: z.string().min(1),
  PAYAZA_TENANT_ID: z.preprocess(blankAsUndefined, z.string().default("test")),
  PAYAZA_TRANSACTION_PIN: z.preprocess(blankAsUndefined, z.string().regex(/^\d{6}$/).optional()),
  PAYAZA_ACCOUNT_REFERENCE: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
  ANTHROPIC_API_KEY: z.preprocess(blankAsUndefined, z.string().optional()),
  LICENSE_SIGNING_KEY: z.string().min(32),
  ESCROW_FEE_PERCENT: z.preprocess(blankAsUndefined, z.coerce.number().positive().default(2.5)),
  LICENSE_FEE_KOBO: z.preprocess(blankAsUndefined, z.coerce.number().int().nonnegative().default(50000))
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const missing = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "environment";
      return `${name}: ${issue.message}`;
    });
    throw new Error(`Invalid environment configuration:\n${missing.map((item) => `- ${item}`).join("\n")}`);
  }

  return result.data;
}