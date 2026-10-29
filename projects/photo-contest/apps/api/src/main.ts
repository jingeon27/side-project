import './instrumentation';

import { createApp } from './bootstrap';
import { apiHost, apiPort } from './config/env';

async function main() {
  try {
    const app = await createApp();
    await app.listen(apiPort(), apiHost());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
