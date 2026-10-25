import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a learner can create a knowledge base, generate a plan, and approve it', async ({ page }) => {
  const email = `learner-${randomUUID()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('learning-is-fun-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByRole('heading', { name: /small listens.*steady learning/i })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel('Give it a name').fill('Session debug test');
  await page.getByLabel('What topic?').fill('session security');
  await page.getByLabel('What would you like to learn?').fill('Understand CSRF protection.');
  await page.getByLabel('What do you already know?').fill('I know websites use cookies.');
  await page.getByRole('button', { name: 'Create knowledge base' }).click();
  await expect(page.getByRole('heading', { name: 'Session debug test' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'session-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Session security is stronger when a server verifies an origin and a CSRF token on each browser change. Cookies identify the session, while the CSRF token proves the request came from the intended app. These checks work together to prevent an unrelated site from using a learner’s active session.'),
  });
  await expect(page.getByText(/characters · ready to use/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Create my plan/ }).click();
  await expect(page.getByRole('button', { name: 'Approve this plan' })).toBeEnabled({ timeout: 15_000 });

  const knowledgeBaseId = new URL(page.url()).pathname.split('/').pop();
  const savedRevision = await page.evaluate(async (id) => {
    const session = await fetch('/api/session').then((response) => response.json());
    const course = await fetch(`/api/courses/${id}`).then((response) => response.json());
    const saved = await fetch(`/api/courses/${id}/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify({ revision: course.course.revision, plan: course.course.plan }),
    });
    const result = await saved.json();
    if (!saved.ok) throw new Error(`Could not simulate a stale plan page (${saved.status}): ${result.error}`);
    return result.revision as number;
  }, knowledgeBaseId);
  expect(savedRevision).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Approve this plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your episodes' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Listen to/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: /Listen to/ }).click();
  await expect(page.getByRole('button', { name: 'Play episode' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Session debug test' }).click();
  await expect(page).toHaveURL(new RegExp(`/knowledge/${knowledgeBaseId}$`));
  await expect(page.getByRole('heading', { name: 'Your episodes' })).toBeVisible();
});
