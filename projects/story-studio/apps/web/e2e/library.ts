import type { Page } from '@playwright/test';

import type { TProject } from '../src/features/story/model/story';

// Works are files in the studio's data folder, shared by every test that talks to the real server.
// Each test gets its own library instead: the same saving contract, kept in memory for one page.
export async function mockLibrary(page: Page, projects: TProject[] = []) {
  const library = { projects: [...projects], saves: 0 };
  await page.route('**/api/projects', (route) =>
    route.fulfill({ json: { projects: library.projects, unreadable: 0 } }),
  );
  await page.route('**/api/projects/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const index = library.projects.findIndex((project) => project.id === id);
    const current = library.projects[index];
    if (route.request().method() === 'GET')
      return current
        ? route.fulfill({ json: current })
        : route.fulfill({ status: 404, json: { error: '작품을 찾을 수 없습니다.' } });
    if (route.request().method() === 'DELETE') {
      if (current) library.projects.splice(index, 1);
      return route.fulfill({ json: { id } });
    }
    const body = route.request().postDataJSON() as { project: TProject; base: string | null };
    // A save must start from the stored version, as the real store requires.
    if (current && current.updatedAt !== body.base)
      return route.fulfill({
        status: 409,
        json: { error: '이 작품이 다른 곳에서 바뀌었습니다.', project: current },
      });
    library.saves += 1;
    if (current) library.projects[index] = body.project;
    else library.projects.unshift(body.project);
    return route.fulfill({ json: body.project });
  });
  return library;
}

// On a phone, project switching and backup import share the workspace menu.
export async function openLibraryMenu(page: Page) {
  const menu = page.getByRole('button', { name: '작업실 메뉴' });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') await menu.click();
}

export async function openSavedProject(page: Page, title: RegExp) {
  await openLibraryMenu(page);
  await page.getByRole('navigation', { name: '저장한 작품' }).getByRole('button', { name: title }).click();
}
