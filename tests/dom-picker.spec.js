// @ts-check
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('an-author', 'DOM Reviewer');
  });
  await page.reload();
  await page.waitForFunction(() => !!window.Annotate);
  await page.evaluate(() => window.Annotate.enable());
});

test('hovering a page element shows its overlay, label, size and ancestry', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#__an_inspect_overlay')).toBeVisible();
  await expect(page.locator('#__an_inspect_label')).toContainText('h1');
  await expect(page.locator('#__an_inspect_label')).toContainText('×');
  await expect(page.locator('#__an_inspect_crumbs button').last()).toContainText('h1');
});

test('clicking locks the element without firing its page click handler', async ({ page }) => {
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'page-action';
    button.textContent = 'Page action';
    button.style.cssText = 'position:fixed;left:100px;top:120px;width:160px;height:48px';
    window.__pageClicks = 0;
    button.addEventListener('click', () => window.__pageClicks++);
    document.body.appendChild(button);
  });
  await page.locator('[data-tool="inspect"]').click();
  await page.mouse.click(180, 144);

  await expect(page.locator('#__an_elementwrap')).toBeVisible();
  await expect(page.locator('#__an_element_summary')).toContainText('button#page-action');
  expect(await page.evaluate(() => window.__pageClicks)).toBe(0);
});

test('selects ancestors through the breadcrumb and Alt+Arrow keys', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);

  await page.locator('#__an_inspect_crumbs button', { hasText: 'header.hero' }).click();
  await expect(page.locator('#__an_element_summary')).toContainText('header.hero');

  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('#__an_element_summary')).toContainText('div.wrap.hero-grid');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('#__an_element_summary')).toContainText('h1.hero-h');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator('#__an_element_summary')).toContainText('div');
});

test('saves a Keep element annotation with selector and diagnostic metadata', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.locator('#__an_element_comment').fill('Keep this headline.');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  const comment = await page.evaluate(() => window.Annotate.comments()[0]);
  expect(comment).toMatchObject({
    type: 'element',
    verdict: 'keep',
    text: 'Keep this headline.',
    color: '#10b981',
    geom: { kind: 'block', selector: 'h1.hero-h' },
    element: { tag: 'h1', id: null, classes: ['hero-h'] },
  });
  expect(comment.element.textExcerpt).toContain('Turn any website');
  expect(comment.element.ancestry.at(-1)).toBe('h1.hero-h');
  expect(comment.context.url).toBe(page.url());
  expect(comment.context.viewport.width).toBeGreaterThan(0);
  expect(comment.context.rect.width).toBeGreaterThan(0);
  await expect(page.locator('#__an_elementwrap')).toHaveCount(0);
});

test('saves a Change verdict in red', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.locator('#__an_element_comment').fill('Change this headline.');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  expect(await page.evaluate(() => window.Annotate.comments()[0])).toMatchObject({
    type: 'element', verdict: 'change', color: '#ef4444', text: 'Change this headline.',
  });
});

test('records when a decision applies to all similar elements', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('.tool-card').first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole('button', { name: 'Select div.tool-card' }).click();
  await page.getByLabel('Apply to').selectOption('similar');
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Use this decision for every tool card.');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  expect(await page.evaluate(() => window.Annotate.comments()[0].scope)).toEqual({
    kind: 'similar',
    selector: 'div.tool-card',
    matchCount: 6,
  });
});

test('saves a Question verdict in amber', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.getByRole('button', { name: 'Question' }).click();
  await page.locator('#__an_element_comment').fill('Is this headline final?');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  expect(await page.evaluate(() => window.Annotate.comments()[0])).toMatchObject({
    type: 'element', verdict: 'question', color: '#f59e0b', text: 'Is this headline final?',
  });
});

test('never treats annotate.js UI as an inspect target', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const targetBox = await target.boundingBox();
  await page.mouse.move(targetBox.x + 10, targetBox.y + 10);
  const before = await page.locator('#__an_inspect_label').textContent();
  const inspectButton = page.locator('[data-tool="inspect"]');
  const uiBox = await inspectButton.boundingBox();
  await page.mouse.move(uiBox.x + uiBox.width / 2, uiBox.y + uiBox.height / 2);

  await expect(page.locator('#__an_inspect_label')).toHaveText(before);
  expect(before).not.toContain('__an');
});

test('Escape cancels inspection and restores focus and page interaction', async ({ page }) => {
  const inspectButton = page.locator('[data-tool="inspect"]');
  await inspectButton.click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.keyboard.press('Escape');

  await expect(page.locator('#__an_inspect_capture')).toHaveCount(0);
  await expect(page.locator('#__an_elementwrap')).toHaveCount(0);
  await expect(page.locator('[data-tool="cursor"]')).toHaveClass(/an-on/);
  await expect(inspectButton).toBeFocused();
  await target.click();
});

test('inspection causes no layout shift or horizontal overflow', async ({ page }) => {
  const before = await page.evaluate(() => {
    const rect = document.querySelector('header.hero h1').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, scrollWidth: document.documentElement.scrollWidth };
  });
  await page.locator('[data-tool="inspect"]').click();
  const box = await page.locator('header.hero h1').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  const after = await page.evaluate(() => {
    const rect = document.querySelector('header.hero h1').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, scrollWidth: document.documentElement.scrollWidth };
  });

  expect(after).toEqual(before);
  expect(after.scrollWidth).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('exported JSON includes element selector and context metadata', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.locator('#__an_element_comment').fill('Portable element decision.');
  await page.getByRole('button', { name: 'Save annotation' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.Annotate.export()),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const payload = JSON.parse(Buffer.concat(chunks).toString());

  expect(payload.kind).toBe('annotate-export');
  expect(payload.comments[0]).toMatchObject({
    type: 'element',
    verdict: 'keep',
    geom: { kind: 'block', selector: 'h1.hero-h' },
    element: { tag: 'h1', classes: ['hero-h'] },
    context: { url: page.url() },
  });
});

test('imports the previous comment shape unchanged', async ({ page }) => {
  const oldPayload = {
    annotate: '1.0.1',
    kind: 'annotate-export',
    page: 'annotate-demo:/',
    comments: [{
      id: 'old-pin',
      page: 'annotate-demo:/',
      type: 'pin',
      author: 'Earlier Reviewer',
      text: 'Old-format pin',
      color: '#f59e0b',
      geom: { kind: 'pin', selector: 'body', x: 0.5, y: 0.5 },
      resolved: false,
      replies: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  };
  const chooserPromise = page.waitForEvent('filechooser');
  await page.evaluate(() => window.Annotate.import());
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'old-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(oldPayload)),
  });
  await expect.poll(() => page.evaluate(() => window.Annotate.comments().length)).toBe(1);

  expect(await page.evaluate(() => window.Annotate.comments()[0])).toMatchObject({
    id: 'old-pin', type: 'pin', text: 'Old-format pin', geom: { kind: 'pin' },
  });
  expect(await page.evaluate(() => window.Annotate.comments()[0].verdict)).toBeUndefined();
});

test('element annotations survive refresh through local storage', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.locator('#__an_element_comment').fill('Persist this decision.');
  await page.getByRole('button', { name: 'Save annotation' }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.Annotate);

  expect(await page.evaluate(() => window.Annotate.comments()[0])).toMatchObject({
    type: 'element', verdict: 'keep', text: 'Persist this decision.',
  });
  await expect(page.locator('.an-block-tab')).toHaveCount(1);
});

test('the element dialog requires a comment and traps focus', async ({ page }) => {
  await page.locator('[data-tool="inspect"]').click();
  const target = page.locator('header.hero h1');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  const save = page.getByRole('button', { name: 'Save annotation' });
  await save.click();

  expect(await page.evaluate(() => window.Annotate.comments().length)).toBe(0);
  expect(await page.locator('#__an_element_comment').evaluate(element => element.checkValidity())).toBe(false);
  await save.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('__an_elementwrap').contains(document.activeElement))).toBe(true);
});
