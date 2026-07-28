import { useCallback, useRef, useState } from "react";
import type { CalendarItem } from "@/lib/types";
import { SNAP_MINUTES } from "./planner-layout";

/**
 * Long-press to pick an event up, drag to move it, release to commit.
 *
 * Built on pointer events rather than a gesture library — the app has no
 * dependency for this and does not need one. The long press is what makes the
 * gesture coexist with scrolling: a timeline is a scrolling surface first, so
 * touching an event has to keep scrolling the page until the user has clearly
 * asked for something else. Moving more than a few pixels before the timer
 * fires cancels the arm and hands the gesture back to the scroller.
 */

const ARM_MS = 380;
const SLOP = 8;

export type DragMode = "move" | "resize-start" | "resize-end";

export type DragState = {
  id: string;
  mode: DragMode;
  /** Minutes to add to the item's original start. */
  startDelta: number;
  /** Minutes to add to the item's original end. */
  endDelta: number;
};

export function useDragSchedule({
  pixelsPerMinute,
  onCommit,
}: {
  pixelsPerMinute: number;
  onCommit(item: CalendarItem, startShift: number, endShift: number): void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const session = useRef<{
    item: CalendarItem;
    mode: DragMode;
    originY: number;
    armed: boolean;
    timer: number;
    pointerId: number;
    node: HTMLElement;
    startDelta: number;
    endDelta: number;
  } | null>(null);

  /*
   * A pointerup that ends a drag is still followed by a click, which would open
   * the item's detail sheet every time something was moved. The flag is read
   * and cleared by the click handler, so a genuine tap — which never armed —
   * is unaffected.
   */
  const suppressClick = useRef(false);

  const finish = useCallback(
    (commit: boolean) => {
      const current = session.current;
      session.current = null;
      setDrag(null);
      if (!current) return;
      window.clearTimeout(current.timer);
      current.node.releasePointerCapture?.(current.pointerId);
      current.node.style.touchAction = "";
      if (current.armed) suppressClick.current = true;
      if (commit && current.armed && (current.startDelta || current.endDelta))
        onCommit(current.item, current.startDelta, current.endDelta);
    },
    [onCommit],
  );

  /** True when the click that follows a drag should be ignored. */
  const consumeClick = useCallback(() => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }, []);

  const onPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      item: CalendarItem,
      mode: DragMode,
    ) => {
      // A second finger during a drag means a pinch or a scroll; give up rather
      // than fight the browser for it.
      if (session.current) return finish(false);
      if (!item.startAt || !item.endAt) return;
      const node = event.currentTarget;
      const timer = window.setTimeout(() => {
        const current = session.current;
        if (!current) return;
        current.armed = true;
        // Only now is the element taken out of the scroller's control.
        current.node.style.touchAction = "none";
        current.node.setPointerCapture?.(current.pointerId);
        navigator.vibrate?.(8);
        setDrag({ id: item.id, mode, startDelta: 0, endDelta: 0 });
      }, ARM_MS);
      session.current = {
        item,
        mode,
        originY: event.clientY,
        armed: false,
        timer,
        pointerId: event.pointerId,
        node,
        startDelta: 0,
        endDelta: 0,
      };
    },
    [finish],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = session.current;
      if (!current) return;
      const travel = event.clientY - current.originY;
      if (!current.armed) {
        // Moved before the press was long enough: this was a scroll.
        if (Math.abs(travel) > SLOP) finish(false);
        return;
      }
      event.preventDefault();
      const minutes =
        Math.round(travel / pixelsPerMinute / SNAP_MINUTES) * SNAP_MINUTES;
      const startDelta = current.mode === "resize-end" ? 0 : minutes;
      let endDelta = current.mode === "resize-start" ? 0 : minutes;
      // A resize may not invert or collapse the event.
      if (current.mode === "resize-end") {
        const span =
          (new Date(current.item.endAt!).getTime() -
            new Date(current.item.startAt!).getTime()) /
          60_000;
        endDelta = Math.max(endDelta, SNAP_MINUTES - span);
      }
      if (current.mode === "resize-start") {
        const span =
          (new Date(current.item.endAt!).getTime() -
            new Date(current.item.startAt!).getTime()) /
          60_000;
        current.startDelta = Math.min(startDelta, span - SNAP_MINUTES);
        current.endDelta = 0;
        setDrag({
          id: current.item.id,
          mode: current.mode,
          startDelta: current.startDelta,
          endDelta: 0,
        });
        return;
      }
      current.startDelta = startDelta;
      current.endDelta = endDelta;
      setDrag({
        id: current.item.id,
        mode: current.mode,
        startDelta,
        endDelta,
      });
    },
    [finish, pixelsPerMinute],
  );

  const onPointerUp = useCallback(() => finish(true), [finish]);
  const onPointerCancel = useCallback(() => finish(false), [finish]);

  return {
    drag,
    consumeClick,
    handlers: { onPointerMove, onPointerUp, onPointerCancel },
    onPointerDown,
  };
}
