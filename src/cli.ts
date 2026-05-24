import { getEnv } from './config/env.js';
import { runPipeline } from './pipeline/run.js';

async function main() {
  const env = getEnv();
  const recipient = process.argv[2] || env.DEFAULT_RECIPIENT;
  if (!recipient) {
    console.error('Usage: tsx src/cli.ts <recipient_email>  (or set DEFAULT_RECIPIENT in .env)');
    process.exit(1);
  }
  const result = await runPipeline({ recipient_email: recipient });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
