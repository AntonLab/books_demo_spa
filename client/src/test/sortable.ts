import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The attribute a sortable list puts on each row it lets dnd-kit measure
// (SortableList). Named here rather than imported, so no component
// depends on a test helper.
const SORTABLE_ROW_ATTRIBUTE = 'data-sortable-row';

const ROW_HEIGHT = 40;

// jsdom lays nothing out, so every element measures as a zero rect and
// dnd-kit's keyboard coordinates find no row above or below the one being
// moved. This stacks the rows vertically, in document order, which is all the
// sortable strategy needs. Returns the restore function.
export const layOutSortableRows = (): (() => void) => {
  const spy = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement): DOMRect {
      const rows = [
        ...document.querySelectorAll(`[${SORTABLE_ROW_ATTRIBUTE}]`),
      ];
      const row = this.closest(`[${SORTABLE_ROW_ATTRIBUTE}]`);
      const index = row ? rows.indexOf(row) : 0;
      const top = index * ROW_HEIGHT;

      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 400,
        bottom: top + ROW_HEIGHT,
        width: 400,
        height: ROW_HEIGHT,
        toJSON: () => ({}),
      };
    });

  return () => spy.mockRestore();
};

// Picks a row up by its handle, moves it `steps` rows, and drops it — the
// sequence a keyboard user performs: Space, arrows, Space.
export const moveWithKeyboard = async (
  handle: HTMLElement,
  direction: 'ArrowDown' | 'ArrowUp',
  steps = 1
): Promise<void> => {
  act(() => handle.focus());
  await userEvent.keyboard('[Space]');
  for (let step = 0; step < steps; step += 1) {
    await userEvent.keyboard(`[${direction}]`);
  }
  await userEvent.keyboard('[Space]');
};
