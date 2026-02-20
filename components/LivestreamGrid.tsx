"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import type { FC } from "react"
import GridLayout from "react-grid-layout"
import { noCompactor } from "react-grid-layout"
import { LivestreamPlayer } from "@components/LivestreamPlayer"
import type { Livestream } from "@components/types"
import {
  buildEvenLayout,
  buildLayoutPreservingManual,
  computeGridMetrics,
  hasOutOfBounds,
  hasOverlap,
  loadStoredManualLayout,
  migrateLegacyManualLayout,
  packMobileNoGaps,
  repairLayoutToVisible,
  resolveResizeWithMinimalMoves,
  sanitizeLayoutFromGrid,
  saveStoredManualLayout,
  type LayoutItem
} from "@lib/grid/layout-engine"

interface Props {
  livestreams: Livestream[]
  onRemove: (id: string) => void
  onSelectSource: (livestreamId: string, sourceId: string) => void
  layoutStorageKey: string
}

export const LivestreamGrid: FC<Props> = ({ livestreams, onRemove, onSelectSource, layoutStorageKey }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [gridSize, setGridSize] = useState({
    // Keep first render deterministic between SSR and client hydration.
    width: 1920,
    height: 1080
  })
  const isInteractingRef = useRef(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isResizeInvalid, setIsResizeInvalid] = useState(false)
  const [manualLayout, setManualLayout] = useState<LayoutItem[] | null>(null)
  const lastValidLayoutRef = useRef<LayoutItem[] | null>(null)
  const resizeRejectedRef = useRef(false)
  const resizeGrewRef = useRef(false)
  const interactionItemIdRef = useRef<string | null>(null)
  const dragStartLayoutRef = useRef<LayoutItem[] | null>(null)
  const modeLayoutStorageKey = `${layoutStorageKey}_${gridSize.width < 768 ? "mobile" : "desktop"}`

  useEffect(() => {
    const migrated = migrateLegacyManualLayout(layoutStorageKey, modeLayoutStorageKey)
    setManualLayout(migrated ?? loadStoredManualLayout(modeLayoutStorageKey))
  }, [modeLayoutStorageKey, layoutStorageKey])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateSize = () => {
      setGridSize({
        width: node.clientWidth,
        height: node.clientHeight
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const metrics = useMemo(
    () => computeGridMetrics(gridSize.width, gridSize.height, livestreams.length),
    [gridSize.width, gridSize.height, livestreams.length]
  )

  const manualMaxRow = useMemo(() => {
    if (!manualLayout || manualLayout.length === 0) return 0
    return manualLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  }, [manualLayout])

  const dynamicRowsBase = useMemo(() => {
    if (metrics.isMobile) return metrics.rows
    return Math.max(metrics.rows, manualMaxRow, livestreams.length)
  }, [metrics, manualMaxRow, livestreams.length])

  const interactionRows = useMemo(() => {
    if (metrics.isMobile) {
      if (!isInteracting) return dynamicRowsBase
      return Math.max(dynamicRowsBase, metrics.rows + Math.max(2, livestreams.length))
    }
    if (!isInteracting) return dynamicRowsBase
    return Math.max(dynamicRowsBase, metrics.rows + 12)
  }, [metrics, dynamicRowsBase, isInteracting, livestreams.length])

  const layoutMetrics = useMemo(
    () => ({ ...metrics, rows: interactionRows }),
    [metrics, interactionRows]
  )

  const streamIdsInOrder = useMemo(() => livestreams.map((stream) => stream.id), [livestreams])
  const defaultLayout = useMemo(
    () => buildEvenLayout(streamIdsInOrder, metrics),
    [streamIdsInOrder, metrics]
  )
  const layout = useMemo(
    () => buildLayoutPreservingManual(streamIdsInOrder, manualLayout, defaultLayout, layoutMetrics),
    [streamIdsInOrder, manualLayout, defaultLayout, layoutMetrics]
  )
  const cellWidth = metrics.layoutWidth / metrics.cols
  const occupiedRows = useMemo(() => {
    if (layout.length === 0) return metrics.rows
    return Math.max(metrics.rows, layout.reduce((max, item) => Math.max(max, item.y + item.h), 0))
  }, [layout, metrics.rows])

  const gridRenderRows = useMemo(() => {
    if (metrics.isMobile) return occupiedRows
    if (!isInteracting) return occupiedRows
    return Math.max(occupiedRows, interactionRows)
  }, [metrics.isMobile, occupiedRows, isInteracting, interactionRows])

  const gridRenderHeightPx = Math.max(gridSize.height, Math.ceil(gridRenderRows * metrics.rowHeight))

  useEffect(() => {
    if (!isInteractingRef.current) {
      lastValidLayoutRef.current = layout
    }
  }, [layout])

  useEffect(() => {
    if (isInteractingRef.current) return
    if (livestreams.length === 0) return

    const streamIds = new Set(livestreams.map((stream) => stream.id))
    if (!hasOutOfBounds(layout, layoutMetrics) && !hasOverlap(layout)) return

    const repaired = repairLayoutToVisible(layout, streamIds, layoutMetrics)
    const packed = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired

    if (hasOutOfBounds(packed, layoutMetrics) || hasOverlap(packed)) return

    setManualLayout(packed)
    saveStoredManualLayout(modeLayoutStorageKey, packed)
    lastValidLayoutRef.current = packed
  }, [layout, livestreams, layoutMetrics, modeLayoutStorageKey])

  const onInteractionStart = () => {
    isInteractingRef.current = true
    setIsInteracting(true)
    setIsResizeInvalid(false)
  }

  const canResizeFitAll = (resizedItem: LayoutItem): boolean => {
    const totalCells = layoutMetrics.cols * layoutMetrics.rows
    const otherWindowsMinCells = Math.max(0, livestreams.length - 1)
    const maxAllowedArea = Math.max(1, totalCells - otherWindowsMinCells)
    return resizedItem.w * resizedItem.h <= maxAllowedArea
  }

  const commitLayout = (
    layoutArg: unknown,
    mode: "drag" | "resize",
    prioritizedId?: string | null,
    resizeGrew = false
  ) => {
    if (!isInteractingRef.current) return
    isInteractingRef.current = false
    setIsInteracting(false)
    setIsResizeInvalid(false)
    if (!Array.isArray(layoutArg)) return
    const layoutItems = layoutArg as LayoutItem[]
    const streamIds = new Set(livestreams.map((stream) => stream.id))
    const activeId = prioritizedId ?? interactionItemIdRef.current
    const nextUnpacked =
      mode === "resize"
        ? (() => {
            // Keep the exact resize result if it still fits and doesn't overlap.
            const direct = sanitizeLayoutFromGrid(layoutItems, streamIds, layoutMetrics)
            if (!hasOutOfBounds(direct, layoutMetrics) && !hasOverlap(direct)) {
              return direct
            }

            // If the item was reduced, do not trigger automatic reflow.
            if (!resizeGrew) {
              return direct
            }

            // Reflow only affected items first, keeping unaffected cells untouched when possible.
            const minimal = resolveResizeWithMinimalMoves(layoutItems, streamIds, layoutMetrics, activeId)
            if (!hasOutOfBounds(minimal, layoutMetrics) && !hasOverlap(minimal)) {
              return minimal
            }

            return repairLayoutToVisible(minimal, streamIds, layoutMetrics, activeId)
          })()
        : sanitizeLayoutFromGrid(layoutItems, streamIds, layoutMetrics)
    let next = metrics.isMobile ? packMobileNoGaps(nextUnpacked, streamIds) : nextUnpacked
    if (mode === "drag" && (hasOutOfBounds(next, layoutMetrics) || hasOverlap(next))) {
      const repaired = repairLayoutToVisible(next, streamIds, layoutMetrics, activeId)
      next = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired
    }
    if (mode === "resize" && resizeGrew && (hasOutOfBounds(next, layoutMetrics) || hasOverlap(next))) {
      const repaired = repairLayoutToVisible(next, streamIds, layoutMetrics, activeId)
      next = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired
    }
    if (hasOutOfBounds(next, layoutMetrics) || hasOverlap(next)) {
      if (lastValidLayoutRef.current) {
        setManualLayout(lastValidLayoutRef.current)
      }
      interactionItemIdRef.current = null
      return
    }
    setManualLayout(next)
    saveStoredManualLayout(modeLayoutStorageKey, next)
    lastValidLayoutRef.current = next
    interactionItemIdRef.current = null
  }

  const cellsOverlap = (a: LayoutItem, b: LayoutItem): boolean => {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  const tryBuildSwapLayout = (
    startLayout: LayoutItem[],
    draggedId: string,
    dropped: LayoutItem,
    streamIds: Set<string>
  ): LayoutItem[] | null => {
    const normalizedStart = sanitizeLayoutFromGrid(startLayout, streamIds, layoutMetrics)
    const draggedStart = normalizedStart.find((item) => item.i === draggedId)
    if (!draggedStart) return null

    const probe: LayoutItem = {
      ...draggedStart,
      x: dropped.x,
      y: dropped.y,
      w: dropped.w,
      h: dropped.h
    }

    let bestTarget: LayoutItem | null = null
    let bestArea = 0

    for (const candidate of normalizedStart) {
      if (candidate.i === draggedId) continue
      if (candidate.w !== draggedStart.w || candidate.h !== draggedStart.h) continue
      if (!cellsOverlap(probe, candidate)) continue

      const overlapW = Math.max(0, Math.min(probe.x + probe.w, candidate.x + candidate.w) - Math.max(probe.x, candidate.x))
      const overlapH = Math.max(0, Math.min(probe.y + probe.h, candidate.y + candidate.h) - Math.max(probe.y, candidate.y))
      const overlapArea = overlapW * overlapH
      if (overlapArea > bestArea) {
        bestArea = overlapArea
        bestTarget = candidate
      }
    }

    if (!bestTarget || bestArea === 0) return null

    const swapped = normalizedStart.map((item) => {
      if (item.i === draggedStart.i) {
        return { ...item, x: bestTarget.x, y: bestTarget.y }
      }
      if (item.i === bestTarget.i) {
        return { ...item, x: draggedStart.x, y: draggedStart.y }
      }
      return item
    })

    return metrics.isMobile ? packMobileNoGaps(swapped, streamIds) : swapped
  }

  const reorderMobileLayout = (
    currentLayout: LayoutItem[],
    draggedId: string,
    targetIndex: number,
    streamIds: Set<string>
  ): LayoutItem[] => {
    const ordered = currentLayout
      .filter((item) => streamIds.has(item.i))
      .sort((a, b) => a.y - b.y || a.x - b.x)

    const dragged = ordered.find((item) => item.i === draggedId)
    if (!dragged) {
      return packMobileNoGaps(currentLayout, streamIds)
    }

    const withoutDragged = ordered.filter((item) => item.i !== draggedId)
    const index = Math.max(0, Math.min(Math.round(targetIndex), withoutDragged.length))

    withoutDragged.splice(index, 0, {
      ...dragged,
      x: 0,
      y: index,
      w: 1,
      h: 1
    })

    return withoutDragged.map((item, idx) => ({
      ...item,
      x: 0,
      y: idx,
      w: 1,
      h: 1
    }))
  }

  const onDragStart = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    void oldItemArg
    onInteractionStart()
    dragStartLayoutRef.current = layout
    if (newItemArg && typeof newItemArg === "object") {
      interactionItemIdRef.current = (newItemArg as LayoutItem).i ?? null
    } else {
      interactionItemIdRef.current = null
    }
  }

  const onDragStop = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    const streamIds = new Set(livestreams.map((stream) => stream.id))
    const droppedItem = newItemArg && typeof newItemArg === "object" ? (newItemArg as LayoutItem) : null
    const draggedId = droppedItem?.i ?? null

    if (draggedId && droppedItem && dragStartLayoutRef.current) {
      const swapped = tryBuildSwapLayout(dragStartLayoutRef.current, draggedId, droppedItem, streamIds)
      if (swapped) {
        isInteractingRef.current = false
        setIsInteracting(false)
        setIsResizeInvalid(false)
        const safeSwap = hasOutOfBounds(swapped, layoutMetrics)
          ? repairLayoutToVisible(swapped, streamIds, layoutMetrics, draggedId)
          : swapped
        setManualLayout(safeSwap)
        saveStoredManualLayout(modeLayoutStorageKey, safeSwap)
        lastValidLayoutRef.current = safeSwap
        interactionItemIdRef.current = null
        dragStartLayoutRef.current = null
        return
      }
    }

    if (metrics.isMobile) {
      isInteractingRef.current = false
      setIsInteracting(false)
      setIsResizeInvalid(false)

      const sourceLayout = Array.isArray(layoutArg) ? (layoutArg as LayoutItem[]) : layout
      const targetY = droppedItem?.y ?? 0

      const next = draggedId
        ? reorderMobileLayout(sourceLayout, draggedId, targetY, streamIds)
        : packMobileNoGaps(sourceLayout, streamIds)

      setManualLayout(next)
      saveStoredManualLayout(modeLayoutStorageKey, next)
      lastValidLayoutRef.current = next
      interactionItemIdRef.current = null
      dragStartLayoutRef.current = null
      return
    }

    void oldItemArg
    const prioritizedId = droppedItem?.i ?? null
    dragStartLayoutRef.current = null
    commitLayout(layoutArg, "drag", prioritizedId)
  }

  const onResizeStart = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    onInteractionStart()
    resizeRejectedRef.current = false
    resizeGrewRef.current = false
    if (newItemArg && typeof newItemArg === "object") {
      interactionItemIdRef.current = (newItemArg as LayoutItem).i ?? null
    } else if (oldItemArg && typeof oldItemArg === "object") {
      interactionItemIdRef.current = (oldItemArg as LayoutItem).i ?? null
    } else {
      interactionItemIdRef.current = null
    }
    lastValidLayoutRef.current = layout
  }

  const onResize = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    if (!newItemArg || typeof newItemArg !== "object" || !oldItemArg || typeof oldItemArg !== "object") return
    const resized = newItemArg as LayoutItem
    const oldItem = oldItemArg as LayoutItem
    if (resized.w > oldItem.w || resized.h > oldItem.h || resized.w * resized.h > oldItem.w * oldItem.h) {
      resizeGrewRef.current = true
    }
    interactionItemIdRef.current = resized.i ?? null
    const valid = canResizeFitAll(resized)
    if (!valid) {
      setIsResizeInvalid(true)
      if (!resizeRejectedRef.current) {
        resizeRejectedRef.current = true
        if (lastValidLayoutRef.current) {
          setManualLayout(lastValidLayoutRef.current)
        }
      }
      return
    }
    resizeRejectedRef.current = false
    setIsResizeInvalid(false)
  }

  const onResizeStop = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void oldItemArg
    const prioritizedId =
      newItemArg && typeof newItemArg === "object" ? ((newItemArg as LayoutItem).i ?? null) : null
    if (resizeRejectedRef.current) {
      resizeRejectedRef.current = false
      isInteractingRef.current = false
      setIsInteracting(false)
      setIsResizeInvalid(false)
      interactionItemIdRef.current = null
      if (lastValidLayoutRef.current) {
        setManualLayout(lastValidLayoutRef.current)
      }
      return
    }
    commitLayout(layoutArg, "resize", prioritizedId, resizeGrewRef.current)
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-x-hidden overflow-y-auto bg-black ${isInteracting ? "grid-interacting" : ""} ${
        isResizeInvalid ? "resize-invalid" : ""
      }`}
    >
      <style>{`
        .react-grid-layout {
          background: #000;
        }
        .react-grid-item {
          background: #000;
          border: none;
          border-radius: 0;
        }
        .react-grid-item img {
          pointer-events: none;
          user-select: none;
        }
        .react-grid-item.resizing .player-live-content,
        .react-grid-item.react-draggable-dragging .player-live-content,
        .react-grid-item.dragging .player-live-content {
          visibility: hidden;
          opacity: 0;
        }
        .react-grid-item.resizing .player-dummy-content,
        .react-grid-item.react-draggable-dragging .player-dummy-content,
        .react-grid-item.dragging .player-dummy-content {
          display: flex;
          z-index: 5;
        }
        .react-grid-item.resizing iframe,
        .react-grid-item.react-draggable-dragging iframe,
        .react-grid-item.dragging iframe {
          pointer-events: none;
        }
        .grid-interacting .react-grid-item .player-live-content {
          visibility: hidden;
          opacity: 0;
        }
        .grid-interacting .react-grid-item .player-dummy-content {
          display: flex;
          z-index: 5;
        }
        .grid-interacting .react-grid-item iframe {
          pointer-events: none;
        }
        .resize-invalid .react-grid-item .player-dummy-content {
          background: rgba(127, 29, 29, 0.9) !important;
          outline: 1px solid rgba(248, 113, 113, 0.9);
        }
      `}</style>
      <GridLayout
        className="w-full overflow-hidden"
        layout={layout as any}
        compactor={noCompactor}
        autoSize={false}
        gridConfig={{
          cols: metrics.cols,
          rowHeight: metrics.rowHeight,
          maxRows: layoutMetrics.rows,
          margin: [0, 0],
          containerPadding: [0, 0]
        }}
        dragConfig={{
          enabled: true,
          bounded: true,
          handle: ".drag-handle",
          cancel: ".no-drag"
        }}
        resizeConfig={{
          enabled: !metrics.isMobile,
          handles: ["n", "s", "e", "w", "ne", "nw", "se", "sw"]
        }}
        width={metrics.layoutWidth}
        style={{
          height: `${gridRenderHeightPx}px`,
          backgroundColor: "#030712",
          backgroundImage:
            "linear-gradient(to right, rgba(59,130,246,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.12) 1px, transparent 1px)",
          backgroundSize: `${cellWidth}px ${metrics.rowHeight}px`,
          backgroundPosition: "0 0, 0 0"
        }}
        onDragStart={onDragStart as any}
        onDragStop={onDragStop as any}
        onResizeStart={onResizeStart as any}
        onResize={onResize as any}
        onResizeStop={onResizeStop as any}
      >
        {livestreams.map((stream) => (
          <div key={stream.id} className="flex flex-col h-full overflow-hidden bg-black">
            <LivestreamPlayer
              stream={stream}
              onRemove={() => onRemove(stream.id)}
              onSelectSource={(sourceId) => onSelectSource(stream.id, sourceId)}
            />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
