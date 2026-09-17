const { test, expect } = require('@playwright/test');

async function openDutch(page) {
  await page.route('**/dutch-review', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="nl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{padding-top:130px}h1{max-width:280px}</style></head><body>
    <h1>Change</h1><p>Een voorbeeldpagina voor feedback.</p>
    <script>window.AnnotateWordPress={restUrl:'/wp-json/annotate/v1/reviews',nonce:'public-nonce',nonceHeader:'X-Annotate-Nonce',reviewer:{name:'',email:''}};window.AnnotateConfig={project:'nl-test',startOpen:false};</script>
    <script src="/wordpress/annotate-review-nl.js"></script><script src="/wordpress/annotate-review.js"></script><script src="/annotate.js"></script>
  </body></html>` }));
  await page.goto('/dutch-review');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  await page.getByPlaceholder('Bijvoorbeeld Jan Jansen').fill('Jan Jansen');
  await page.getByRole('button', { name: 'Begin met feedback' }).click();
  await page.getByRole('button', { name: 'Onderdeel aanwijzen', exact: true }).click();
  const heading = await page.getByRole('heading', { name: 'Change', exact: true }).boundingBox();
  await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2);
  await page.getByRole('button', { name: 'Aanpassen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Opmerking', exact: true }).fill('Change');
  await page.getByRole('button', { name: 'Opmerking opslaan' }).click();
}

test('Dutch interface preserves content, protocol values and stored annotations', async ({ page }) => {
  await openDutch(page);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('annotate:nl-test')));
  expect(stored.comments[0]).toMatchObject({ type: 'element', verdict: 'change', page: 'nl-test:/dutch-review', text: 'Change', author: 'Jan Jansen' });
  await expect(page.getByRole('heading', { name: 'Change', exact: true })).toBeVisible();
  await expect(page.locator('#__an_list .an-body')).toHaveText('Change');
  await expect(page.locator('#__an_foot')).toContainText('Met Feedback versturen');
  const fits = await page.locator('#__an_panel').evaluate(panel => {
    const bounds = panel.getBoundingClientRect();
    return [...panel.querySelectorAll('#__an_foot button')].every(button => {
      const rect = button.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right;
    });
  });
  expect(fits).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Feedback (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Opmerkingen', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('annotate:nl-test')).comments[0].text)).toBe('Change');
});

for (const mailSent of [true, false]) {
  test(`Dutch submission reports stored review and mail outcome (${mailSent})`, async ({ page }) => {
    let request;
    await page.route('**/wp-json/annotate/v1/reviews', async route => {
      request = { body: route.request().postDataJSON(), nonce: route.request().headers()['x-annotate-nonce'] };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 42, mailSent }) });
    });
    await openDutch(page);
    await page.getByRole('button', { name: 'Feedback versturen', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Feedback versturen' });
    await page.getByLabel('Je naam', { exact: true }).fill('Jan Jansen');
    await page.getByLabel('Je e-mailadres').fill('jan@example.test');
    await dialog.getByRole('button', { name: 'Feedback versturen' }).click();
    await expect(dialog.getByRole('status')).toContainText(mailSent ? 'Feedback #42 is opgeslagen. De e-mail is geaccepteerd voor verzending.' : 'Feedback #42 is opgeslagen, maar de e-mail kon niet worden verstuurd.');
    await expect(dialog.getByRole('button', { name: 'Sluiten' })).toBeVisible();
    expect(request.nonce).toBe('public-nonce');
    expect(request.body.review.comments[0]).toMatchObject({ verdict: 'change', text: 'Change' });
  });
}


test('pin composer is Dutch too', async ({ page }) => {
  await openDutch(page);
  await page.getByRole('button', { name: 'Opmerkingenoverzicht sluiten' }).click();
  await page.getByRole('button', { name: 'Pin', exact: true }).click();
  await page.mouse.click(45, 230);
  await expect(page.locator('#__an_compose .an-ctitle')).toContainText('Opmerking: Pin');
});
