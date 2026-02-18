"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import type { FC } from "react"
import GridLayout from "react-grid-layout"
import { noCompactor } from "react-grid-layout"
import type { Livestream } from "./types"
import { LivestreamPlayer } from "./LivestreamPlayer"

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  static?: boolean
}

interface Props {
  livestreams: Livestream[]
  onRemove: (id: string) => void
  layoutStorageKey: string
}

interface GridMetrics {
  width: number
  layoutWidth: number
  height: number
  contentHeight: number
  cols: number
  rows: number
  rowHeight: number
  isMobile: boolean
}

const TARGET_ASPECT = 16 / 9
const STREAM_HEADER_HEIGHT_PX = 24
const STREAM_HEADER_BORDER_PX = 1
const STREAM_CHROME_HEIGHT_PX = STREAM_HEADER_HEIGHT_PX + STREAM_HEADER_BORDER_PX
const STREAM_FRAME_WIDTH_PX = 1
const STREAM_FRAME_HEIGHT_PX = 1
const TARGET_ROW_PX = 180

const parseStoredLayout = (raw: string | null): LayoutItem[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LayoutItem[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const loadStoredManualLayout = (storageKey: string): LayoutItem[] | null => {
  if (typeof window === "undefined") return null

  try {
    return parseStoredLayout(localStorage.getItem(storageKey))
  } catch {
    return null
  }
}

const saveStoredManualLayout = (storageKey: string, layout: LayoutItem[] | null): void => {
  if (typeof window === "undefined") return
  try {
    if (!layout || layout.length === 0) {
      localStorage.removeItem(storageKey)
      return
    }
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // ignore storage errors
  }
}

const migrateLegacyManualLayout = (legacyKey: string, modeKey: string): LayoutItem[] | null => {
  if (typeof window === "undefined") return null

  try {
    const modeLayout = parseStoredLayout(localStorage.getItem(modeKey))
    if (modeLayout) return modeLayout

    const legacyLayout = parseStoredLayout(localStorage.getItem(legacyKey))
    if (!legacyLayout) return null

    localStorage.setItem(modeKey, JSON.stringify(legacyLayout))
    localStorage.removeItem(legacyKey)
    return legacyLayout
  } catch {
    return null
  }
}

const buildRowCounts = (count: number, rows: number): number[] => {
  const safeRows = Math.max(1, rows)
  const base = Math.floor(count / safeRows)
  const extra = count % safeRows
  // Put denser rows at the bottom so top (higher-priority) rows stay wider.
  return Array.from({ length: safeRows }, (_, index) => {
    const extraStart = safeRows - extra
    return base + (index >= extraStart ? 1 : 0)
  }).filter((v) => v > 0)
}

const buildRowHeights = (rowsToUse: number, totalRows: number): number[] => {
  const safeRowsToUse = Math.max(1, rowsToUse)
  const safeTotalRows = Math.max(safeRowsToUse, totalRows)
  const base = Math.floor(safeTotalRows / safeRowsToUse)
  const extra = safeTotalRows % safeRowsToUse
  return Array.from({ length: safeRowsToUse }, (_, index) => base + (index < extra ? 1 : 0))
}

const computeGridMetrics = (width: number, height: number, itemCount: number): GridMetrics => {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const isMobile = safeWidth < 768
  const chromeX = STREAM_FRAME_WIDTH_PX
  const chromeY = STREAM_CHROME_HEIGHT_PX + STREAM_FRAME_HEIGHT_PX

  const tileWidthFromRowHeight = (rowHeight: number): number =>
    Math.max(1, (Math.max(1, rowHeight - chromeY) * TARGET_ASPECT) + chromeX)

  const rowHeightFromColWidth = (colWidth: number): number =>
    Math.max(1, (Math.max(1, colWidth - chromeX) / TARGET_ASPECT) + chromeY)

  if (isMobile) {
    const cols = 1
    const rows = Math.max(1, itemCount)
    const colWidth = safeWidth
    const fittedRowHeight = rowHeightFromColWidth(colWidth)
    const contentHeightPx = rows * fittedRowHeight

    return {
      width: safeWidth,
      layoutWidth: safeWidth,
      height: safeHeight,
      contentHeight: contentHeightPx,
      cols,
      rows,
      rowHeight: fittedRowHeight,
      isMobile
    }
  }

  // Desktop: rows must always fit viewport height. Derive cols from this fixed rowHeight.
  const rows = Math.max(1, Math.floor(safeHeight / TARGET_ROW_PX))
  const rowHeight = safeHeight / rows
  const targetTileWidth = tileWidthFromRowHeight(rowHeight)
  const cols = Math.max(1, Math.floor(safeWidth / targetTileWidth))

  // Use full container width so every visible column is usable.
  const layoutWidth = safeWidth

  return {
    width: safeWidth,
    layoutWidth,
    height: safeHeight,
    contentHeight: safeHeight,
    cols,
    rows,
    rowHeight,
    isMobile
  }
}

const allocateEvenly = (totalUnits: number, count: number): number[] => {
  if (count === 0) return []
  if (count === 1) return [Math.max(1, totalUnits)]

  const safeTotal = Math.max(count, totalUnits)
  const base = Math.floor(safeTotal / count)
  const extra = safeTotal % count
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0))
}

const intersects = (a: LayoutItem, b: LayoutItem): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const clampSquareItem = (item: LayoutItem, metrics: GridMetrics): LayoutItem => {
  const size = Math.min(
    Math.max(1, Math.round(Math.max(item.w, item.h))),
    Math.max(1, Math.min(metrics.cols, metrics.rows))
  )
  const x = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, metrics.cols - size))
  const y = Math.min(Math.max(0, Math.round(item.y)), Math.max(0, metrics.rows - size))
  return { ...item, x, y, w: size, h: size }
}

const clampLayoutItem = (item: LayoutItem, metrics: GridMetrics): LayoutItem => {
  const w = Math.min(metrics.cols, Math.max(1, Math.round(item.w)))
  const h = Math.min(metrics.rows, Math.max(1, Math.round(item.h)))
  const x = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, metrics.cols - w))
  const y = Math.min(Math.max(0, Math.round(item.y)), Math.max(0, metrics.rows - h))
  return { ...item, x, y, w, h }
}

const findOpenSlot = (
  item: LayoutItem,
  placed: LayoutItem[],
  metrics: GridMetrics
): Pick<LayoutItem, "x" | "y"> => {
  for (let y = item.y; y <= metrics.rows - item.h; y += 1) {
    for (let x = y === item.y ? item.x : 0; x <= metrics.cols - item.w; x += 1) {
      const probe: LayoutItem = { ...item, x, y }
      if (!placed.some((existing) => intersects(probe, existing))) {
        return { x, y }
      }
    }
  }

  for (let y = 0; y <= metrics.rows - item.h; y += 1) {
    for (let x = 0; x <= metrics.cols - item.w; x += 1) {
      const probe: LayoutItem = { ...item, x, y }
      if (!placed.some((existing) => intersects(probe, existing))) {
        return { x, y }
      }
    }
  }

  return {
    x: Math.min(Math.max(0, item.x), Math.max(0, metrics.cols - item.w)),
    y: Math.min(Math.max(0, item.y), Math.max(0, metrics.rows - item.h))
  }
}

const fitItemIntoGrid = (item: LayoutItem, placed: LayoutItem[], metrics: GridMetrics): LayoutItem => {
  const base = clampSquareItem(item, metrics)
  const desiredX = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, metrics.cols - 1))
  const desiredY = Math.min(Math.max(0, Math.round(item.y)), Math.max(0, metrics.rows - 1))
  const sizeCandidates: number[] = []
  for (let size = base.w; size >= 1; size -= 1) sizeCandidates.push(size)

  for (const size of sizeCandidates) {
    const candidate = clampSquareItem({ ...base, x: desiredX, y: desiredY, w: size, h: size }, metrics)
    const slot = findOpenSlot(candidate, placed, metrics)
    const positioned: LayoutItem = { ...candidate, ...slot }
    if (!placed.some((existing) => intersects(positioned, existing))) {
      return positioned
    }
  }

  // Last resort: smallest possible tile in first free slot.
  const tiny = clampSquareItem({ ...base, w: 1, h: 1 }, metrics)
  const slot = findOpenSlot(tiny, placed, metrics)
  return { ...tiny, ...slot }
}

const normalizeLayout = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics,
  prioritizedItemId?: string | null
): LayoutItem[] => {
  const unique = new Set<string>()
  const filtered = layout
    .filter((item) => streamIds.has(item.i))
    .filter((item) => {
      if (unique.has(item.i)) return false
      unique.add(item.i)
      return true
    })
    .sort((a, b) => {
      if (prioritizedItemId) {
        if (a.i === prioritizedItemId && b.i !== prioritizedItemId) return -1
        if (b.i === prioritizedItemId && a.i !== prioritizedItemId) return 1
      }
      return (a.y - b.y) || (a.x - b.x)
    })

  const placed: LayoutItem[] = []
  for (const raw of filtered) {
    const fitted =
      prioritizedItemId && raw.i === prioritizedItemId
        ? (() => {
            // Keep the resized item dimensions and let other items adapt around it.
            const pinned = clampSquareItem(raw, metrics)
            const slot = findOpenSlot(pinned, placed, metrics)
            return { ...pinned, ...slot }
          })()
        : fitItemIntoGrid(raw, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

const sanitizeLayoutFromGrid = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics
): LayoutItem[] => {
  const unique = new Set<string>()
  return layout
    .filter((item) => streamIds.has(item.i))
    .filter((item) => {
      if (unique.has(item.i)) return false
      unique.add(item.i)
      return true
    })
    .map((item) => clampSquareItem(item, metrics))
}

const packMobileNoGaps = (layout: LayoutItem[], streamIds: Set<string>): LayoutItem[] => {
  const unique = new Set<string>()
  return layout
    .filter((item) => streamIds.has(item.i))
    .filter((item) => {
      if (unique.has(item.i)) return false
      unique.add(item.i)
      return true
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((item, index) => ({
      ...item,
      x: 0,
      y: index,
      w: 1,
      h: 1
    }))
}

const buildLayoutPreservingManual = (
  livestreams: Livestream[],
  manualLayout: LayoutItem[] | null,
  defaultLayout: LayoutItem[],
  metrics: GridMetrics
): LayoutItem[] => {
  const streamIds = new Set(livestreams.map((stream) => stream.id))
  const manualSanitized = manualLayout ? sanitizeLayoutFromGrid(manualLayout, streamIds, metrics) : []
  const placed: LayoutItem[] = [...manualSanitized]
  const usedIds = new Set(placed.map((item) => item.i))
  const defaultsById = new Map(defaultLayout.map((item) => [item.i, item]))

  for (const stream of livestreams) {
    if (usedIds.has(stream.id)) continue
    const fallback = defaultsById.get(stream.id)
    if (!fallback) continue
    const fitted = fitItemIntoGrid(clampLayoutItem(fallback, metrics), placed, metrics)
    placed.push(fitted)
    usedIds.add(stream.id)
  }

  return placed
}

const buildLayoutAroundPinned = (
  livestreams: Livestream[],
  defaultLayout: LayoutItem[],
  metrics: GridMetrics,
  pinnedItem: LayoutItem
): LayoutItem[] => {
  const streamIds = new Set(livestreams.map((stream) => stream.id))
  const defaultsById = new Map(defaultLayout.map((item) => [item.i, item]))
  const pinned = clampSquareItem(pinnedItem, metrics)
  const placed: LayoutItem[] = [pinned]
  const totalCells = metrics.cols * metrics.rows

  for (let index = 0; index < livestreams.length; index += 1) {
    const stream = livestreams[index]
    if (!streamIds.has(stream.id) || stream.id === pinned.i) continue

    const remainingItems = livestreams
      .slice(index)
      .filter((item) => item.id !== pinned.i && !placed.some((p) => p.i === item.id)).length
    const usedCells = placed.reduce((sum, item) => sum + (item.w * item.h), 0)
    const freeCells = Math.max(1, totalCells - usedCells)
    const targetAreaPerItem = Math.max(1, Math.floor(freeCells / Math.max(1, remainingItems)))
    const targetSize = Math.max(1, Math.floor(Math.sqrt(targetAreaPerItem)))
    const fallback = defaultsById.get(stream.id) ?? { i: stream.id, x: 0, y: 0, w: 1, h: 1 }
    const candidate = clampSquareItem({ ...fallback, w: targetSize, h: targetSize }, metrics)
    const fitted = fitItemIntoGrid(candidate, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

const buildEvenLayout = (streams: Livestream[], metrics: GridMetrics): LayoutItem[] => {
  if (streams.length === 0) return []

  const placed: LayoutItem[] = []
  const totalCells = metrics.cols * metrics.rows

  for (let index = 0; index < streams.length; index += 1) {
    const stream = streams[index]
    const remainingItems = streams.length - index
    const usedCells = placed.reduce((sum, item) => sum + (item.w * item.h), 0)
    const freeCells = Math.max(1, totalCells - usedCells)
    const targetAreaPerItem = Math.max(1, Math.floor(freeCells / Math.max(1, remainingItems)))
    const targetSize = Math.max(1, Math.floor(Math.sqrt(targetAreaPerItem)))
    const seed: LayoutItem = {
      i: stream.id,
      x: 0,
      y: 0,
      w: targetSize,
      h: targetSize,
      static: false
    }
    const fitted = fitItemIntoGrid(seed, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

export const LivestreamGrid: FC<Props> = ({ livestreams, onRemove, layoutStorageKey }) => {
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
  const interactionItemIdRef = useRef<string | null>(null)
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

  const defaultLayout = useMemo(() => buildEvenLayout(livestreams, metrics), [livestreams, metrics])
  const layout = useMemo(
    () => buildLayoutPreservingManual(livestreams, manualLayout, defaultLayout, metrics),
    [livestreams, manualLayout, defaultLayout, metrics]
  )
  const cellWidth = metrics.layoutWidth / metrics.cols

  useEffect(() => {
    if (!isInteractingRef.current) {
      lastValidLayoutRef.current = layout
    }
  }, [layout])

  const onInteractionStart = () => {
    isInteractingRef.current = true
    setIsInteracting(true)
    setIsResizeInvalid(false)
  }

  const canResizeFitAll = (resizedItem: LayoutItem): boolean => {
    const totalCells = metrics.cols * metrics.rows
    const otherWindowsMinCells = Math.max(0, livestreams.length - 1)
    const maxAllowedArea = Math.max(1, totalCells - otherWindowsMinCells)
    return resizedItem.w * resizedItem.h <= maxAllowedArea
  }

  const commitLayout = (
    layoutArg: unknown,
    mode: "drag" | "resize",
    prioritizedId?: string | null
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
      mode === "resize" && activeId
        ? (() => {
            const active = layoutItems.find((item) => item.i === activeId)
            if (!active) {
              return normalizeLayout(layoutItems, streamIds, metrics, activeId)
            }
            return buildLayoutAroundPinned(livestreams, defaultLayout, metrics, active)
          })()
        : mode === "resize"
          ? normalizeLayout(layoutItems, streamIds, metrics, activeId)
          : sanitizeLayoutFromGrid(layoutItems, streamIds, metrics)
    const next = metrics.isMobile ? packMobileNoGaps(nextUnpacked, streamIds) : nextUnpacked
    setManualLayout(next)
    saveStoredManualLayout(modeLayoutStorageKey, next)
    lastValidLayoutRef.current = next
    interactionItemIdRef.current = null
  }

  const onDragStart = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    void oldItemArg
    onInteractionStart()
    if (newItemArg && typeof newItemArg === "object") {
      interactionItemIdRef.current = (newItemArg as LayoutItem).i ?? null
    } else {
      interactionItemIdRef.current = null
    }
  }

  const onDragStop = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void oldItemArg
    const prioritizedId =
      newItemArg && typeof newItemArg === "object" ? ((newItemArg as LayoutItem).i ?? null) : null
    commitLayout(layoutArg, "drag", prioritizedId)
  }

  const onResizeStart = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    onInteractionStart()
    resizeRejectedRef.current = false
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
    void oldItemArg
    if (!newItemArg || typeof newItemArg !== "object") return
    const resized = newItemArg as LayoutItem
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
    commitLayout(layoutArg, "resize", prioritizedId)
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
          maxRows: metrics.rows,
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
          height: metrics.isMobile ? `${metrics.contentHeight}px` : "100%",
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
            <LivestreamPlayer stream={stream} onRemove={() => onRemove(stream.id)} />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
