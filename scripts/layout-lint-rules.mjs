// Runs in Node: true when the app ended on another path than requested;
// ?query, #hash and a trailing "/" do not count.
export const isRedirected = (path, landed) =>
  landed.replace(/\/$/, '') !==
  `/${path.replace(/[?#].*$/, '')}`.replace(/\/$/, '');

// Runs in the page, so it must stay self-contained (page.evaluate serializes it).
// Two rules: R1 a visible element lies outside the viewport (scrollable
// containers and SVG are skipped); R2 a word of 6+ characters spans several
// lines (line-clamp and ellipsis text are skipped).
export const lint = () => {
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
    // antd's tab bar scrolls by a transform inside an overflow-x:hidden wrap.
    if (el.closest('svg, .ant-tabs-nav-wrap') || inScroller(el)) continue;
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
