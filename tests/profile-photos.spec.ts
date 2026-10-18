import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

test.use({ trace: "off" });
const id = (role: string) => process.env[`PR22_${role.toUpperCase()}_ID`]!;
const org = process.env.PR22_ORGANIZATION_ID!;
const editor = (page: Page, target: string) => page.locator(`[data-profile-photo-editor="${target}"]`);
test('photo mutations require an authenticated same-origin session', async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  for (const method of ['POST', 'DELETE']) {
    expect((await request.fetch('/api/profile-photo', { method, headers: { Origin: origin }, multipart: {} })).status()).toBe(401);
    expect((await request.fetch('/api/profile-photo', { method, headers: { Origin: 'https://unrelated.example' }, multipart: {} })).status()).toBe(403);
  }
});
async function login(page: Page, role: string) {
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(process.env[`PR22_${role}_EMAIL`]!);
  await page.getByLabel('Password', { exact: true }).fill(process.env[`PR22_${role}_PASSWORD`]!);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role.includes('COACH') ? 'coach' : role.includes('OWNER') ? 'owner' : 'client'}$`));
}
async function upload(page: Page, target: string, color: string, replace = false) {
  const photo = editor(page, target);
  const bytes = await sharp({ create: { width: 1400, height: 1100, channels: 3, background: color } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const chooser = page.waitForEvent('filechooser'); await photo.getByRole('button', { name: /^Change .*profile photo$/ }).click();
  await (await chooser).setFiles({ buffer: bytes, name: 'non-personal-test.jpg', mimeType: 'image/jpeg' });
  const dialog = photo.getByRole('dialog'); await expect(dialog.getByRole('img', { name: 'Cropped profile photo preview' })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/profile-photo') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: replace ? 'Replace photo' : 'Save photo', exact: true }).click();
  const result = await (await saved).json();
  expect(result.cleanupPending).toBe(false);
  await expect(photo.getByRole('status')).toContainText('Profile photo updated');
  await expect(dialog).not.toBeVisible();
  const image = photo.getByRole('button', { name: /^Change .*profile photo$/ }).locator('img');
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  const url = result.imageUrl as string; // Team refresh correctly switches its display to the 160px thumbnail.
  const response = await page.request.get(url); expect(response.status()).toBe(200);
  const metadata = await sharp(await response.body()).metadata();
  expect(metadata.format).toBe('webp'); expect(metadata.exif).toBeUndefined();
  expect(metadata.width).toBe(1024); return url;
}

test('staff photo management, private Storage isolation, replacement failures and persistent thumbnails', async ({ page, browser }, testInfo) => {
  test.skip(!process.env.RAVOGE_PHOTO_QA || !org, 'Explicit disposable Ravoge photo QA required'); test.setTimeout(300_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, 'OWNER'); await page.goto(`/owner/clients/${id('client')}`);
  const first = await upload(page, id('client'), '#587a68');
  const second = await upload(page, id('client'), '#a78b57', true);
  expect(new URL(first).pathname).not.toBe(new URL(second).pathname);
  // Previously fetched signed URLs may remain in the Storage CDN cache until expiry.
  // Check the underlying object through a fresh authenticated, cache-busted request.
  const oldObject = new URL(first); oldObject.pathname = oldObject.pathname.replace('/object/sign/', '/object/authenticated/'); oldObject.search = `?qa=${Date.now()}`;
  expect((await page.request.get(oldObject.toString(), { headers: await storageHeaders(page) })).ok()).toBe(false);
  // A failed network replacement leaves the existing image visible and is retryable.
  await page.route('**/api/profile-photo', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Upload failed. Your previous photo is unchanged. Retry.' }) }));
  const target = editor(page, id('client'));
  await target.locator('input[type=file]').first().setInputFiles({ buffer: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#334455' } }).png().toBuffer(), name: 'retry.png', mimeType: 'image/png' });
  await target.getByRole('dialog').getByRole('button', { name: 'Replace photo', exact: true }).click();
  await expect(target.getByRole('status')).toContainText('previous photo is unchanged');
  expect(new URL((await target.getByRole('button', { name: /^Change .*profile photo$/ }).locator('img').getAttribute('src'))!).pathname).toBe(new URL(second).pathname);
  await target.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.unroute('**/api/profile-photo');
  await target.locator('input[type=file]').first().setInputFiles({ buffer: Buffer.from('not an image'), name: 'bad.txt', mimeType: 'text/plain' });
  await expect(target.getByRole('status')).toContainText('not supported');
  await target.locator('input[type=file]').first().setInputFiles({ buffer: Buffer.alloc(20 * 1024 * 1024 + 1), name: 'huge.jpg', mimeType: 'image/jpeg' });
  await expect(target.getByRole('status')).toContainText('20 MB');
  await page.reload(); await expect(target.locator('button img')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => target.locator('button img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await target.getByRole('button', { name: /^Change .*profile photo$/ }).focus();
  await expect(target.getByRole('button', { name: /^Change .*profile photo$/ })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('client-profile-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/owner/clients');
  const thumb = page.getByRole('link', { name: 'Open Client: QA Client', exact: true }).locator('img');
  await expect(thumb).toBeVisible(); const thumbnail = await page.request.get((await thumb.getAttribute('src'))!);
  expect((await sharp(await thumbnail.body()).metadata()).width).toBe(160);
  await page.goto('/owner/team'); await upload(page, id('coach'), '#6e7991'); await upload(page, id('coach'), '#50765e', true);
  await page.reload(); await expect(editor(page, id('coach')).locator('button img')).toBeVisible();
  if (process.env.RAVOGE_PHOTO_HEIC_FIXTURE) {
    const bytes = await readFile(process.env.RAVOGE_PHOTO_HEIC_FIXTURE);
    for (const type of ['heic', 'heif']) {
      const photo = editor(page, id('coach'));
      await photo.locator('input[type=file]').first().setInputFiles({ buffer: bytes, name: `sample.${type}`, mimeType: `image/${type}` });
      const dialog = photo.getByRole('dialog'); await expect(dialog.getByRole('img', { name: 'Cropped profile photo preview' })).toBeVisible({ timeout: 30_000 });
      await dialog.screenshot({ path: testInfo.outputPath(`converted-${type}.png`) });
      await dialog.getByRole('button', { name: 'Replace photo', exact: true }).click();
      await expect(photo.getByRole('status')).toContainText('Profile photo updated');
    }
  }
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 1000]]) {
    await page.setViewportSize({ width, height }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`team-${width}.png`), fullPage: true });
  }
  const coachContext = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const coach = await coachContext.newPage(); coach.on('pageerror', error => errors.push(error.message));
  await login(coach, 'COACH'); await coach.goto(`/coach/clients/${id('client')}`); const coachPhoto = await upload(coach, id('client'), '#8f664d', true);
  expect(await coach.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await coach.screenshot({ path: testInfo.outputPath('coach-client-ipad.png'), fullPage: true });
  // API tampering cannot target another Coach or another organization's Client.
  for (const [targetId, organizationId] of [[id('other_coach'), org], [id('external_client'), process.env.PR22_EXTERNAL_ORGANIZATION_ID!]]) {
    const response = await coach.request.delete('/api/profile-photo', { headers: { Origin: new URL(coach.url()).origin }, multipart: { targetUserId: targetId, organizationId } }); expect(response.status()).toBe(403);
  }
  const externalContext = await browser.newContext(); const external = await externalContext.newPage(); await login(external, 'EXTERNAL_OWNER');
  expect((await external.request.delete('/api/profile-photo', { headers: { Origin: new URL(external.url()).origin }, multipart: { targetUserId: id('client'), organizationId: org } })).status()).toBe(403);
  // Storage API probes use normal authenticated browser cookies decoded only in memory.
  async function storageHeaders(actor: Page) {
    const cookies = await actor.context().cookies(); const name = `sb-kqdnljafaiohlijbgfld-auth-token`;
    const value = cookies.filter(cookie => cookie.name === name || cookie.name.startsWith(name + '.')).sort((a,b) => a.name.localeCompare(b.name)).map(cookie => cookie.value).join('');
    const session = JSON.parse(Buffer.from(value.slice(7), 'base64url').toString());
    return { Authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! };
  }
  const objectPath = decodeURIComponent(new URL(coachPhoto).pathname.split('/sign/profile-images/')[1]);
  const storage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
  const externalHeaders = await storageHeaders(external);
  const wrongUpload = await external.request.post(`${storage}/object/profile-images/${org}/${id('client')}/avatar/v2-91000000-0000-4000-8000-000000000099.webp`, { headers: { ...externalHeaders, 'Content-Type': 'image/webp' }, data: await sharp({ create: { width: 20, height: 20, channels: 3, background: '#445566' } }).webp().toBuffer() });
  expect(wrongUpload.ok()).toBe(false);
  expect((await external.request.post(`${storage}/object/sign/profile-images/${objectPath}`, { headers: externalHeaders, data: { expiresIn: 60 } })).ok()).toBe(false);
  const listing = await external.request.post(`${storage}/object/list/profile-images`, { headers: externalHeaders, data: { prefix: `${org}/${id('client')}/avatar`, limit: 100 } });
  expect(await listing.json()).toEqual([]);
  await external.request.delete(`${storage}/object/profile-images`, { headers: externalHeaders, data: { prefixes: [objectPath] } });
  expect((await coach.request.get(coachPhoto)).status()).toBe(200);
  expect((await external.request.get(`${storage}/object/authenticated/profile-images/${objectPath}`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } })).ok()).toBe(false);
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const client = await clientContext.newPage();
  await login(client, 'CLIENT'); await client.goto('/client/profile'); await expect(editor(client, 'client').locator('button img')).toBeVisible();
  await client.getByRole('button', { name: 'Log out', exact: true }).click(); await login(client, 'CLIENT'); await client.goto('/client/profile');
  await expect(editor(client, 'client').locator('button img')).toBeVisible();
  await coach.reload(); await expect(editor(coach, id('client')).locator('button img')).toBeVisible();
  coach.on('dialog', dialog => dialog.accept()); await editor(coach, id('client')).getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(editor(coach, id('client')).getByRole('status')).toContainText('Profile photo removed');
  await expect(editor(coach, id('client')).locator('button img')).toHaveCount(0);
  expect(errors).toEqual([]); await coachContext.close(); await externalContext.close(); await clientContext.close();
});
