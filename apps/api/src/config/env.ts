import { fileURLToPath } from "node:url";
import { z } from "zod";
import dotenv from "dotenv";

// Load the shared .env file from the repository root.
const envPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
dotenv.config({ path: envPath });

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

  MONGODB_URI: z
    .string()
    .trim()
    .min(1)
    .default("mongodb://127.0.0.1:27017/storm"),

  SUPABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),

  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid API environment configuration:");

  for (const issue of result.error.issues) {
    console.error(
      `- ${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
  }

  process.exit(1);
}

export const env = result.data;
