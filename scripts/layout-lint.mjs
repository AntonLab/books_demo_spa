// Layout check at phone width in a real browser: logs in, opens each page and
// reports what jsdom cannot see. Usage:
//   LAYOUT_LINT_PASSWORD=... node scripts/layout-lint.mjs [--base URL] [--user NAME]
//     [--channel msedge|chrome] [--width 375] <path>[|<tab text>] ...
// A path is relative to the base ("books/17", no leading slash: Git Bash turns
// "/x" into a Windows path). "|Reading lists" clicks that text after loading.
// Exit 1 when any page has a finding. A page the app redirects elsewhere only
// warns, since the checked page is then not the requested one.
import { chromium } from 'playwright-core';
import { lint } from './layout-lint-rules.mjs';

const argv = process.argv.slice(2);
const opt = {
  base: 'http://localhost:3100',
  user: 'user1',
  channel: 'msedge',
  width: '375',
};
const pages = [];
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i]?.match(/^--(base|user|channel|width)$/)?.[1];
  if (flag) opt[flag] = argv[++i] ?? '';
  else if (argv[i]) pages.push(argv[i]);
}
const password = process.env.LAYOUT_LINT_PASSWORD;
if (!password || pages.length === 0) {
  console.error(
    'usage: LAYOUT_LINT_PASSWORD=... node scripts/layout-lint.mjs [flags] <path>...'
  );
  process.exit(2);
}

const browser = await chromium.launch({ channel: opt.channel });
let failed = false;
try {
  const page = await browser.newPage({
    viewport: { width: Number(opt.width), height: 800 },
  });
  await page.goto(`${opt.base}/`);
  await page.getByText('Log in', { exact: true }).first().click();
  await page.getByLabel('Login or email').fill(opt.user);
  await page.getByLabel('Password').fill(password);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Log in' }).click();
  await dialog.waitFor({ state: 'detached' });

  for (const entry of pages) {
    const [path, tab] = entry.split('|');
    await page.goto(`${opt.base}/${path}`);
    // No networkidle: the dev server keeps a socket open.
    await page.waitForTimeout(2000);
    const landed = new URL(page.url()).pathname;
    if (landed !== `/${path}`)
      console.log(
        `warn ${entry}: requested /${path} but the app is at ${landed} (redirected for ${opt.user}?)`
      );
    if (tab) {
      await page.getByText(tab).first().click();
      await page.waitForTimeout(1500);
    }
    const found = await page.evaluate(lint);
    const bad =
      found.overflowX > 0 ||
      found.offscreen.length > 0 ||
      found.midWord.length > 0;
    failed ||= bad;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${entry}`);
    if (found.overflowX > 0)
      console.log(`  page scrolls ${found.overflowX}px sideways`);
    for (const line of found.offscreen)
      console.log(`  outside viewport: ${line}`);
    for (const line of found.midWord) console.log(`  broken mid-word: ${line}`);
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
