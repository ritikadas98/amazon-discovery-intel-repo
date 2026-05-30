import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // Vertex AI (auth via ADC — Cloud Run runtime SA in prod, gcp-service-account.json locally)
  VERTEX_PROJECT_ID: z.string().min(1, 'VERTEX_PROJECT_ID is required'),
  VERTEX_REGION: z.string().default('asia-south1'),
  VERTEX_MODEL: z.string().default('gemini-2.5-flash'),

  // Optional: only used locally. On Cloud Run, the runtime SA is picked up via ADC.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  SHEETS_DOCUMENT_ID: z.string().min(1),
  SHEETS_SIGNALS_TAB: z.string().default('Signals'),
  SHEETS_DIGESTS_TAB: z.string().default('Weekly Digests'),
  SHEETS_EFFORT_TAB: z.string().default('Effort Estimates'),
  SHEETS_FEEDBACK_TAB: z.string().default('Feedback'),

  // Public-facing base URL of this service (used to bake links into the digest email).
  // Required for the 👍/👎 feedback anchors to work; locally, falls back to localhost:PORT.
  PUBLIC_BASE_URL: z.string().optional(),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  DEFAULT_RECIPIENT: z.string().email().optional(),
  PORT: z.coerce.number().default(3000),
  USE_MOCK: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  CRON_SCHEDULE: z.string().default('0 9 1 * *'),
  CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
