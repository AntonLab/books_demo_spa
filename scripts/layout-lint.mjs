// Layout check at phone width in a real browser: logs in, opens each page and
// reports what jsdom cannot see. Usage:
//   LAYOUT_LINT_PASSWORD=... node scripts/layout-lint.mjs [--base URL] [--user NAME]
//     [--channel msedge|chrome] [--width 375] <path>[|<tab text>] ...
// A path is relative to the base ("books/17", no leading slash: Git Bash turns
// "/x" into a Windows path). "|Reading lists" clicks that text after loading.
// Exit 1 when any page has a finding.
import { chromium } from 'playwright-core';

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

// Runs in the page. Two rules: R1 a visible element lies outside the viewport
// (scrollable containers and SVG are skipped); R2 a word of 6+ characters spans
// several lines (line-clamp and ellipsis text are skipped).
const lint = () => {
  const W = window.innerWidth;
  const found = {
    overflowX: document.documentElement.scrollWidth - W,
    offscreen: [],
    midWord: [],
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth)
        return true;
    }
    return false;
  };
  const name = (el) =>
    `${el.tagName.toLowerCase()}[${(el.textContent ?? '').trim().slice(0, 24)}]`;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (
      !r.width ||
      !r.height ||
      cs.visibility === 'hidden' ||
      cs.display === 'none'
    )
      continue;
    if (el.closest('svg') || inScroller(el)) continue;
    if (r.left < -1 || r.right > W + 1) {
      found.offscreen.push(
        `${name(el)} left=${Math.round(r.left)} right=${Math.round(r.right)}`
      );
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.webkitLineClamp !== 'none' || cs.textOverflow === 'ellipsis')
      continue;
    for (const m of n.data.matchAll(/\S{6,}/g)) {
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const rows = new Set(
        [...range.getClientRects()].map((x) => Math.round(x.top))
      );
      if (rows.size > 1 && el.getBoundingClientRect().width)
        found.midWord.push(`${m[0]} in ${name(el)}`);
    }
  }
  found.offscreen = found.offscreen.slice(0, 6);
  found.midWord = found.midWord.slice(0, 6);
  return found;
};

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
