import './instrumentation';
import { createApp } from './bootstrap';
async function main() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 4200), process.env.API_HOST ?? '127.0.0.1');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
