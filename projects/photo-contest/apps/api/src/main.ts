import './instrumentation';

import { createApp } from './bootstrap';
import { apiHost, apiPort } from './config/env';

async function main() {
  const app = await createApp();
  await app.listen(apiPort(), apiHost());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
