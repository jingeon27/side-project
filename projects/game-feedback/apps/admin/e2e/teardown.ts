import { dropBrowserDatabase } from '../../api/src/testing/browser-database';

export default async function teardown() {
  await dropBrowserDatabase();
}
