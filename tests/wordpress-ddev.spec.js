// @ts-check
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const baseURL = process.env.WP_BASE_URL;
const publicMode = process.env.WP_PUBLIC_MODE === '1';
test.skip(!baseURL, 'Set WP_BASE_URL to run the DDEV WordPress integration tests.');
test.use({ ignoreHTTPSErrors: true });

async function loginAdmin(page) {
  await page.goto(`${baseURL}/wp-login.php`);
  await page.locator('#user_login').fill('admin');
  await page.locator('#user_pass').fill('annotate-test-only');
  await page.locator('#wp-submit').click();
  await page.waitForURL(/wp-admin/);
}

test('does not load annotation tools for signed-out visitors', async ({ page }) => {
  test.skip(publicMode, 'Public staging mode intentionally loads the annotation tools.');
  await page.goto(baseURL);
  expect(await page.evaluate(() => !!window.Annotate)).toBe(false);
  await expect(page.locator('#wp-admin-bar-annotate-review')).toHaveCount(0);
});

test('admin proposes text and an image, then submits the review', async ({ page }) => {
  test.skip(publicMode, 'Public staging mode intentionally disables image uploads.');
  await loginAdmin(page);
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.Annotate);
  await expect(page.locator('#forcys-tour-help')).toHaveCount(0);

  await page.locator('#wp-admin-bar-annotate-review > a').click();
  await expect(page.locator('#__an_bar')).toBeVisible();
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('#review-heading');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 5, box.y + 5);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Use the approved headline and campaign image.');
  await page.getByLabel('Proposed text').fill('Approved homepage headline');
  await page.getByLabel('Proposed image').setInputFiles(path.join(__dirname, '..', 'logo.png'));
  await page.getByLabel('Image description').fill('Annotate logo');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  await expect.poll(() => page.evaluate(() => window.Annotate.comments().length)).toBe(1);
  await expect(target).toContainText('Approved homepage headline');
  await expect(target.locator('img.an-proposal-image')).toBeVisible();
  await page.getByRole('button', { name: 'Submit review' }).click();

  const dialog = page.getByRole('dialog', { name: 'Submit review' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Overall message').fill('Homepage review is ready for implementation.');
  const responsePromise = page.waitForResponse(response => response.url().includes('/wp-json/annotate/v1/reviews'));
  await dialog.getByRole('button', { name: 'Submit review' }).click();
  await expect(dialog.getByRole('status')).toContainText(/Review #\d+ saved and email sent\./);
  const result = await (await responsePromise).json();
  expect(result).toMatchObject({ mailSent: true });

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(url => { window.location.href = url; }, result.exportUrl);
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const review = JSON.parse(Buffer.concat(chunks).toString());
  expect(review.comments[0]).toMatchObject({
    verdict: 'change',
    proposal: {
      text: { after: 'Approved homepage headline' },
      image: { attachment: { id: expect.any(Number), mime: 'image/png' } },
    },
  });

  const attachmentId = review.comments[0].proposal.image.attachment.id;
  const mediaResponse = await page.request.get(`${baseURL}/wp-json/wp/v2/media/${attachmentId}`);
  expect(mediaResponse.ok()).toBe(true);
  expect(await mediaResponse.json()).toMatchObject({ id: attachmentId, mime_type: 'image/png' });

  const mailpitURL = `http://${new URL(baseURL).hostname}:8025/api/v1/messages`;
  await expect.poll(async () => JSON.stringify(await (await page.request.get(mailpitURL)).json())).toContain(`Website review #${result.id} submitted`);
});

test('admin welcome tour uses the bundled runtime and submits only in memory', async ({ page }) => {
  await loginAdmin(page);
  const submissions = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/wp-json/annotate/v1/reviews')) submissions.push(request.url());
  });
  await page.goto(`${baseURL}/wp-admin/edit.php?post_type=annotate_review&page=annotate-review-tour`);
  await page.waitForFunction(() => !!window.Annotate);

  const welcome = page.getByRole('dialog', { name: 'Welkom bij Forcys Annotate' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Start de rondleiding' }).click();
  const guide = page.locator('#forcys-tour');
  for (const tool of ['cursor', 'inspect', 'highlight', 'rect', 'circle', 'pen', 'pin']) {
    await expect(page.locator(`[data-tool="${tool}"]`)).toHaveClass(/an-on/);
    if (tool !== 'pin') await guide.getByRole('button', { name: 'Volgende' }).click();
  }

  await page.locator('[data-demo-target="pin"]').click({ position: { x: 70, y: 60 } });
  await page.locator('#__an_compose textarea').fill('Dit is mijn veilige testopmerking.');
  await page.locator('#__an_compose .an-primary').click();
  await guide.getByRole('button', { name: 'Volgende' }).click();
  await guide.getByRole('button', { name: 'Volgende' }).click();
  await guide.getByRole('button', { name: 'Volgende' }).click();
  await page.locator('#__an_foot .an-submit').click();

  await expect(page.locator('#forcys-tour-status')).toHaveText('Testreview ontvangen — er is niets verzonden.');
  expect(await page.evaluate(() => window.__forcysDemoSubmission.comments.length)).toBe(1);
  expect(submissions).toEqual([]);
});

test('public staging visitors can submit text-only reviews', async ({ page }) => {
  test.skip(!publicMode, 'Set WP_PUBLIC_MODE=1 after enabling the WordPress staging option.');
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.Annotate);
  await expect(page.locator('#wp-admin-bar-annotate-review')).toHaveCount(0);
  await page.locator('#__an_launch').click();
  await page.locator('#__an_namewrap input').fill('Public Reviewer');
  await page.locator('#__an_namewrap button').click();

  const help = page.locator('#forcys-tour-help');
  await expect(help).toBeVisible();
  const helpBox = await help.boundingBox();
  const hideBox = await page.getByRole('button', { name: 'Hide review tools' }).boundingBox();
  expect(helpBox.y).toBeGreaterThan(hideBox.y);
  await help.click();
  const welcome = page.getByRole('dialog', { name: 'Welkom bij Forcys Annotate' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Nu overslaan' }).click();

  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('#review-heading');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 5, box.y + 5);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByLabel('Proposed text')).toBeVisible();
  await expect(page.getByLabel('Proposed image')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Use the public-review headline.');
  await page.getByLabel('Proposed text').fill('Public staging headline');
  await page.getByRole('button', { name: 'Save annotation' }).click();
  await page.getByRole('button', { name: 'Submit review' }).click();

  const dialog = page.getByRole('dialog', { name: 'Submit review' });
  await page.getByLabel('Your name').fill('Public Reviewer');
  await page.getByLabel('Your email').fill('public@example.test');
  const responsePromise = page.waitForResponse(response => response.url().includes('/wp-json/annotate/v1/reviews'));
  await dialog.getByRole('button', { name: 'Submit review' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ adminUrl: null, exportUrl: null });
  await expect(dialog.getByRole('status')).toContainText(/Review #\d+ saved and email sent\./);
});
