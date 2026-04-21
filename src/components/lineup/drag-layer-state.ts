/**
 * Tiny module-level mirror so the CardDragLayer can detect whether
 * the most recent drag ended in an accepted drop. react-dnd's
 * `DragLayerMonitor` doesn't expose didDrop(); the source's
 * useDrag({ end }) callback does. Sources write here on end; the
 * layer reads on the drag-ended transition.
 *
 * JS is single-threaded — no cross-drag race window.
 */

export const dragResult = {
  lastDropAccepted: false,
};
