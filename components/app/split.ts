/**
 * Desktop split for Borrow and Review. On phones the outer element is one white panel and each
 * pane dissolves into it (`contents`), so the reading order stays the DOM order. From 992px the
 * panes become their own panels: the first and last fill the left column, the middle one sits
 * on the right.
 */
export const SPLIT =
  "flex flex-col rounded-panel bg-sheet p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-4 lg:bg-transparent lg:p-0";

const PANE = "max-lg:contents lg:flex lg:flex-col lg:rounded-panel lg:bg-sheet lg:p-6 empty:hidden";
export const PANE_LEFT_TOP = `${PANE} lg:col-start-1 lg:row-start-1`;
export const PANE_RIGHT = `${PANE} lg:col-start-2 lg:row-span-2 lg:row-start-1`;
export const PANE_LEFT_BOTTOM = `${PANE} lg:col-start-1 lg:row-start-2`;
