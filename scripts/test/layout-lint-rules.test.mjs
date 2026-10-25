import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { lint } from '../layout-lint-rules.mjs';

// Needs an installed Edge or Chrome. Skipped where none launches; under CI it
// fails, so a broken install cannot pass unnoticed.
let browser;
let launchError;
before(async () => {
  for (const channel of ['msedge', 'chrome']) {
    try {
      browser = await chromium.launch({ channel });
      return;
    } catch (error) {
      launchError = error;
    }
  }
  if (process.env.CI)
    throw new Error('no browser launched', { cause: launchError });
});
after(() => browser?.close());

const skipReason = () =>
  `no Edge or Chrome launched: ${launchError?.message.split('\n')[0]}`;

const strip = (cls) => `
  <div class="${cls}-wrap" style="overflow-x:hidden;width:266px">
    <div class="${cls}-list" style="display:flex;width:412px;transform:matrix(1,0,0,1,-146,0)">
      <span style="width:412px">Account Favorites Library Reading lists</span>
    </div>
  </div>`;

const run = async (html) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  try {
    await page.setContent(
      `<body style="margin:0;overflow-x:hidden">${html}</body>`
    );
    return await page.evaluate(lint);
  } finally {
    await page.close();
  }
};

test('a tab bar clipped by ant-tabs-nav-wrap is not reported', async (t) => {
  if (!browser) return t.skip(skipReason());
  const found = await run(strip('ant-tabs-nav'));
  assert.deepEqual(found.offscreen, []);
});

test('the same clipped strip outside ant-tabs-nav-wrap is still reported', async (t) => {
  if (!browser) return t.skip(skipReason());
  const found = await run(strip('other'));
  assert.ok(found.offscreen.length > 0);
});
