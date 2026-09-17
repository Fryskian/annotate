// @ts-check
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__uploadedFiles = [];
    window.AnnotateConfig = {
      contentEditing: true,
      uploadAttachment: async file => {
        if (window.__failUpload) throw new Error('Upload failed');
        window.__uploadedFiles.push({ name: file.name, type: file.type, size: file.size });
        return { id: 42, url: location.origin + '/logo.png', filename: file.name, mime: file.type, width: 1200, height: 800 };
      },
      submitReview: async payload => { window.__submittedReview = payload; },
    };
  });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('an-author', 'WordPress Reviewer');
  });
  await page.reload();
  await page.waitForFunction(() => !!window.Annotate);
  await page.evaluate(() => window.Annotate.enable());
});

test('keeps the dialog usable and saves nothing when an image upload fails', async ({ page }) => {
  await page.evaluate(() => { window.__failUpload = true; });
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Try the replacement image.');
  await page.getByLabel('Proposed image').setInputFiles({ name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('bad') });
  await page.getByLabel('Image description').fill('Replacement image');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  await expect(page.locator('.an-toast')).toContainText('Image upload failed');
  await expect(page.locator('#__an_elementwrap')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save annotation' })).toBeEnabled();
  expect(await page.evaluate(() => window.Annotate.comments().length)).toBe(0);
});

test('submits the same portable payload exposed by the public API', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Question' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Is this approved?');
  await page.getByRole('button', { name: 'Save annotation' }).click();
  await page.getByRole('button', { name: 'Submit review' }).click();

  await expect.poll(() => page.evaluate(() => !!window.__submittedReview)).toBe(true);
  const submitted = await page.evaluate(() => window.__submittedReview);
  const exported = await page.evaluate(() => window.Annotate.exportData());
  expect(Date.parse(submitted.exportedAt)).not.toBeNaN();
  delete submitted.exportedAt;
  delete exported.exportedAt;
  expect(submitted).toEqual(exported);
});

test('uploads and stores an image proposal without embedding the file', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Use the new team photograph.');
  await page.getByLabel('Proposed image').setInputFiles({
    name: 'team.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake-image'),
  });
  await page.getByLabel('Image description').fill('The support team working together');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  await expect.poll(() => page.evaluate(() => window.Annotate.comments().length)).toBe(1);
  expect(await page.evaluate(() => window.__uploadedFiles)).toEqual([
    { name: 'team.jpg', type: 'image/jpeg', size: 10 },
  ]);
  const comment = await page.evaluate(() => window.Annotate.comments()[0]);
  expect(comment.proposal.image).toMatchObject({
    action: 'add',
    alt: 'The support team working together',
    attachment: { id: 42, filename: 'team.jpg', mime: 'image/jpeg', width: 1200, height: 800 },
  });
  expect(JSON.stringify(comment)).not.toContain('fake-image');
  await expect(target.locator('img.an-proposal-image')).toHaveAttribute('src', /\/logo\.png$/);
});

test('saves proposed replacement text with the selected element', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('.tool-card').first().locator('p').first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Use the approved campaign headline.');
  await page.getByLabel('Proposed text').fill('A clearer proposed headline');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  expect(await page.evaluate(() => window.Annotate.comments()[0])).toMatchObject({
    type: 'element',
    verdict: 'change',
    proposal: {
      text: {
        before: 'Select any text to highlight and comment on the exact words — re-anchors even after edits.',
        after: 'A clearer proposed headline',
      },
    },
  });
  await expect(target).toHaveText('A clearer proposed headline');
  await page.reload();
  await page.waitForFunction(() => !!window.Annotate);
  await expect(target).toHaveText('A clearer proposed headline');
});

test('does not offer destructive text replacement for rich elements', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByLabel('Proposed text')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Preserve the emphasized phrase.');
  await page.getByRole('button', { name: 'Save annotation' }).click();
  await expect(target.locator('mark')).toHaveText('any website');
});

test('restores proposal previews when annotation mode is disabled', async ({ page }) => {
  const target = page.locator('.tool-card').first().locator('p').first();
  await target.scrollIntoViewIfNeeded();
  await page.locator('[data-tool="inspect"]').click();
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Preview only.');
  await page.getByLabel('Proposed text').fill('Temporary proposal');
  await page.getByRole('button', { name: 'Save annotation' }).click();
  await expect(target).toHaveText('Temporary proposal');

  await page.evaluate(() => window.Annotate.disable());
  await expect(target).toHaveText('Select any text to highlight and comment on the exact words — re-anchors even after edits.');
});
