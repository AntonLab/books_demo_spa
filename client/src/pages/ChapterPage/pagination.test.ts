import {
  arrowLabel,
  clampView,
  directionForClick,
  directionForKey,
  hasPage,
  OPEN_ON_LAST_PAGE,
  opensOnLastPage,
  pageHeightFor,
  pageIndicator,
  pagesPerView,
  toParagraphs,
} from './pagination';

const key = (name: string, target: EventTarget | null = document.body) => ({
  key: name,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target,
});

describe('pagesPerView', () => {
  it('spreads two pages when the width holds both and the gap', () => {
    expect(pagesPerView('medium', 1032, 500, 32)).toBe(2);
  });

  it('shows one page when two do not fit', () => {
    expect(pagesPerView('medium', 1031, 500, 32)).toBe(1);
  });

  it('never spreads the full width', () => {
    expect(pagesPerView('full', 5000, 500, 32)).toBe(1);
  });
});

describe('pageHeightFor', () => {
  it('is the window height left below the top and above the reserve', () => {
    expect(pageHeightFor(900, 150, 120, 100)).toBe(630);
  });

  it('keeps the minimum when the window is too short', () => {
    expect(pageHeightFor(300, 250, 120, 100)).toBe(100);
  });
});

describe('clampView', () => {
  it('keeps a page inside the chapter', () => {
    expect(clampView(-2, 12, 1)).toBe(0);
    expect(clampView(20, 12, 1)).toBe(11);
    expect(clampView(5, 12, 1)).toBe(5);
  });

  it('starts a spread on an even page', () => {
    expect(clampView(5, 12, 2)).toBe(4);
    expect(clampView(20, 12, 2)).toBe(10);
    expect(clampView(10, 11, 2)).toBe(10);
  });
});

describe('hasPage', () => {
  it('has no previous page on the first one', () => {
    expect(hasPage(0, 'previous', 3, 1)).toBe(false);
    expect(hasPage(1, 'previous', 3, 1)).toBe(true);
  });

  it('has no next page once the view reaches the last one', () => {
    expect(hasPage(1, 'next', 3, 1)).toBe(true);
    expect(hasPage(2, 'next', 3, 1)).toBe(false);
    expect(hasPage(2, 'next', 4, 2)).toBe(false);
    expect(hasPage(0, 'next', 3, 2)).toBe(true);
  });

  it('has neither in a one-page chapter', () => {
    expect(hasPage(0, 'previous', 1, 2)).toBe(false);
    expect(hasPage(0, 'next', 1, 2)).toBe(false);
  });
});

describe('pageIndicator', () => {
  it('names one page', () => {
    expect(pageIndicator(2, 12, 1)).toBe('Page 3 of 12');
  });

  it('names both pages of a spread with an en dash', () => {
    expect(pageIndicator(2, 12, 2)).toBe('Pages 3–4 of 12');
  });

  it('names the lone last page of a spread view as one page', () => {
    expect(pageIndicator(10, 11, 2)).toBe('Page 11 of 11');
    expect(pageIndicator(0, 1, 2)).toBe('Page 1 of 1');
  });
});

describe('arrowLabel', () => {
  it('names a page turn', () => {
    expect(arrowLabel('previous', true, { title: 'One' })).toBe(
      'Previous page'
    );
    expect(arrowLabel('next', true, undefined)).toBe('Next page');
  });

  it('names the chapter a hand-off opens', () => {
    expect(arrowLabel('next', false, { title: 'Three' })).toBe(
      'Next chapter: Three'
    );
  });

  it('names a disabled end of the book without a title', () => {
    expect(arrowLabel('previous', false, undefined)).toBe('Previous chapter');
  });
});

describe('toParagraphs', () => {
  it('makes each authored line a paragraph and drops blank ones', () => {
    expect(toParagraphs('One.\n\nTwo.\r\n   \n  Three.  ')).toEqual([
      'One.',
      'Two.',
      'Three.',
    ]);
  });

  it('makes no paragraph of an empty text', () => {
    expect(toParagraphs('')).toEqual([]);
  });
});

describe('directionForKey', () => {
  it('turns forward on the right arrow, Page Down and Space', () => {
    expect(directionForKey(key('ArrowRight'))).toBe('next');
    expect(directionForKey(key('PageDown'))).toBe('next');
    expect(directionForKey(key(' '))).toBe('next');
  });

  it('turns back on the left arrow and Page Up', () => {
    expect(directionForKey(key('ArrowLeft'))).toBe('previous');
    expect(directionForKey(key('PageUp'))).toBe('previous');
  });

  it('ignores any other key', () => {
    expect(directionForKey(key('ArrowDown'))).toBeUndefined();
    expect(directionForKey(key('Enter'))).toBeUndefined();
  });

  it('ignores a key with a modifier held', () => {
    const right = key('ArrowRight');

    expect(directionForKey({ ...right, altKey: true })).toBeUndefined();
    expect(directionForKey({ ...right, ctrlKey: true })).toBeUndefined();
    expect(directionForKey({ ...right, metaKey: true })).toBeUndefined();
    expect(directionForKey({ ...right, shiftKey: true })).toBeUndefined();
  });

  it('ignores a key typed into an editable field', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const inside = document.createElement('span');
    editor.append(inside);

    for (const target of [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      inside,
    ]) {
      expect(directionForKey(key('ArrowLeft', target))).toBeUndefined();
      expect(directionForKey(key(' ', target))).toBeUndefined();
    }
  });

  it('leaves Space to a focused button but still turns on its arrows', () => {
    const button = document.createElement('button');

    expect(directionForKey(key(' ', button))).toBeUndefined();
    expect(directionForKey(key('ArrowRight', button))).toBe('next');
  });
});

describe('directionForClick', () => {
  it('turns back on the left third and forward on the right third', () => {
    expect(directionForClick(120, 100, 900)).toBe('previous');
    expect(directionForClick(950, 100, 900)).toBe('next');
  });

  it('does nothing on the middle third', () => {
    expect(directionForClick(550, 100, 900)).toBeUndefined();
  });

  it('does nothing on a box with no width', () => {
    expect(directionForClick(0, 0, 0)).toBeUndefined();
  });
});

describe('opensOnLastPage', () => {
  it('reads the state the previous arrow sends', () => {
    expect(opensOnLastPage(OPEN_ON_LAST_PAGE)).toBe(true);
  });

  it('reads no state, or any other, as page 1', () => {
    expect(opensOnLastPage(null)).toBe(false);
    expect(opensOnLastPage(undefined)).toBe(false);
    expect(opensOnLastPage({ page: 3 })).toBe(false);
    expect(opensOnLastPage('last')).toBe(false);
  });
});
