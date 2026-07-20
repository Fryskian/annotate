// @ts-check
const { test, expect } = require('@playwright/test');

test('keeps server submission out of the standalone build by default', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.Annotate);
  await page.evaluate(() => window.Annotate.open());
  await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);
});

test('standalone mode never applies imported content proposals', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('annotate:annotate-demo', JSON.stringify({ comments: [{
      id: 'untrusted-proposal',
      page: 'annotate-demo:/',
      type: 'element',
      verdict: 'change',
      text: 'Imported proposal',
      color: '#ef4444',
      geom: { kind: 'block', selector: 'header.hero' },
      proposal: {
        text: { before: 'Original', after: 'Replaced' },
        image: { action: 'add', alt: 'Remote', attachment: { url: 'https://remote.invalid/tracker.png' } },
      },
      resolved: false,
      replies: [],
    }] }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.Annotate);
  await expect(page.locator('header.hero h1')).toContainText('Turn any website');
  await expect(page.locator('header.hero img.an-proposal-image')).toHaveCount(0);
});

test('shows the submit form and posts the review with the WordPress nonce', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.AnnotateWordPress = {
      restUrl: 'https://example.test/wp-json/annotate/v1/reviews',
      nonce: 'rest-nonce',
      reviewer: { name: 'Jane Reviewer', email: 'jane@example.test' },
    };
    window.__reviewRequest = null;
    window.fetch = async (url, options) => {
      window.__reviewRequest = { url, options };
      return { ok: true, json: async () => ({ id: 17, mailSent: true }) };
    };
  });
  await page.addScriptTag({ url: '/wordpress/annotate-review.js' });
  await page.evaluate(() => {
    window.AnnotateConfig.submitReview({
      kind: 'annotate-export',
      page: '/about',
      url: 'https://example.test/about',
      comments: [{ id: 'one', type: 'element', verdict: 'change', text: 'Change it' }],
    });
  });

  const dialog = page.getByRole('dialog', { name: 'Submit review' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Jane Reviewer');
  await expect(page.getByLabel('Your email')).toHaveValue('jane@example.test');
  await page.getByLabel('Overall message').fill('Homepage review is ready.');
  await dialog.getByRole('button', { name: 'Submit review' }).click();

  await expect(dialog.getByRole('status')).toHaveText('Review #17 saved and email sent.');
  const request = await page.evaluate(() => window.__reviewRequest);
  expect(request.url).toBe('https://example.test/wp-json/annotate/v1/reviews');
  expect(request.options.headers['X-WP-Nonce']).toBe('rest-nonce');
  expect(JSON.parse(request.options.body)).toMatchObject({
    reviewer: { name: 'Jane Reviewer', email: 'jane@example.test' },
    message: 'Homepage review is ready.',
    review: { kind: 'annotate-export', comments: [{ id: 'one' }] },
  });
});
