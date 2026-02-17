"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import type { FC } from "react"
import GridLayout from "react-grid-layout"
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
  cols: number
  rows: number
  rowHeight: number
}

const TARGET_ASPECT = 16 / 9
const TARGET_ROW_PX = 180

const loadStoredManualLayout = (storageKey: string): LayoutItem[] | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LayoutItem[]
    return Array.isArray(parsed) ? parsed : null
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

const computeGridMetrics = (width: number, height: number): GridMetrics => {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const maxRowsByMinHeight = Math.max(1, Math.floor(safeHeight / TARGET_ROW_PX))

  const rows = maxRowsByMinHeight
  const rowHeight = safeHeight / rows
  const cellWidth = rowHeight * TARGET_ASPECT
  const cols = Math.max(1, Math.round(safeWidth / cellWidth))

  // Use full container width so every visible column is usable.
  const layoutWidth = safeWidth

  return {
    width: safeWidth,
    layoutWidth,
    height: safeHeight,
    cols,
    rows,
    rowHeight
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
  const base = clampLayoutItem(item, metrics)
  const widthCandidates: number[] = []
  const heightCandidates: number[] = []

  for (let w = base.w; w >= 1; w -= 1) widthCandidates.push(w)
  for (let h = base.h; h >= 1; h -= 1) heightCandidates.push(h)

  for (const w of widthCandidates) {
    for (const h of heightCandidates) {
      const candidate = clampLayoutItem({ ...base, w, h }, metrics)
      const slot = findOpenSlot(candidate, placed, metrics)
      const positioned: LayoutItem = { ...candidate, ...slot }
      if (!placed.some((existing) => intersects(positioned, existing))) {
        return positioned
      }
    }
  }

  // Last resort: smallest possible tile in first free slot.
  const tiny = clampLayoutItem({ ...base, w: 1, h: 1 }, metrics)
  const slot = findOpenSlot(tiny, placed, metrics)
  return { ...tiny, ...slot }
}

const normalizeLayout = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics
): LayoutItem[] => {
  const unique = new Set<string>()
  const filtered = layout
    .filter((item) => streamIds.has(item.i))
    .filter((item) => {
      if (unique.has(item.i)) return false
      unique.add(item.i)
      return true
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))

  const placed: LayoutItem[] = []
  for (const raw of filtered) {
    const fitted = fitItemIntoGrid(raw, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

const buildEvenLayout = (streams: Livestream[], metrics: GridMetrics): LayoutItem[] => {
  if (streams.length === 0) return []

  const result: LayoutItem[] = []
  let streamCursor = 0
  const minRowsNeeded = Math.max(1, Math.ceil(streams.length / metrics.cols))
  const targetMaxPerRow = Math.max(1, Math.min(metrics.cols, 4))
  const preferredRows = Math.max(1, Math.ceil(streams.length / targetMaxPerRow))
  const rowsToUse = Math.min(metrics.rows, Math.max(minRowsNeeded, preferredRows))
  const rowCounts = buildRowCounts(streams.length, rowsToUse)
  const rowHeights = buildRowHeights(rowsToUse, metrics.rows)
  let yCursor = 0
  for (let rowIndex = 0; rowIndex < rowCounts.length && streamCursor < streams.length; rowIndex += 1) {
    const countInRow = rowCounts[rowIndex]
    const rowItems = streams.slice(streamCursor, streamCursor + countInRow)
    streamCursor += countInRow
    const rowHeightUnits = rowHeights[rowIndex] ?? 1

    const colUnits = allocateEvenly(metrics.cols, rowItems.length)

    let xCursor = 0
    for (let itemIndex = 0; itemIndex < rowItems.length; itemIndex += 1) {
      const unitWidth = colUnits[itemIndex]
      result.push({
        i: rowItems[itemIndex].id,
        x: xCursor,
        y: yCursor,
        w: unitWidth,
        h: rowHeightUnits,
        static: false
      })
      xCursor += unitWidth
    }
    yCursor += rowHeightUnits
  }

  return result
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

  useEffect(() => {
    setManualLayout(loadStoredManualLayout(layoutStorageKey))
  }, [layoutStorageKey])

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
    () => computeGridMetrics(gridSize.width, gridSize.height),
    [gridSize.width, gridSize.height]
  )

  const defaultLayout = useMemo(() => buildEvenLayout(livestreams, metrics), [livestreams, metrics])
  const layout = useMemo(() => {
    const streamIds = new Set(livestreams.map((stream) => stream.id))
    const defaultsById = new Map(defaultLayout.map((item) => [item.i, item]))
    const manualById = new Map((manualLayout ?? []).map((item) => [item.i, item]))

    const merged = livestreams.map((stream) => {
      const fallback = defaultsById.get(stream.id)
      const manual = manualById.get(stream.id)
      return manual && fallback ? { ...fallback, ...manual, i: stream.id } : (fallback as LayoutItem)
    })

    return normalizeLayout(merged, streamIds, metrics)
  }, [livestreams, defaultLayout, manualLayout, metrics])
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

  const commitLayout = (layoutArg: unknown) => {
    if (!isInteractingRef.current) return
    isInteractingRef.current = false
    setIsInteracting(false)
    setIsResizeInvalid(false)
    if (!Array.isArray(layoutArg)) return
    const layoutItems = layoutArg as LayoutItem[]
    const streamIds = new Set(livestreams.map((stream) => stream.id))
    const next = normalizeLayout(layoutItems, streamIds, metrics)
    setManualLayout(next)
    saveStoredManualLayout(layoutStorageKey, next)
    lastValidLayoutRef.current = next
  }

  const onDragStop = (layoutArg: unknown) => {
    commitLayout(layoutArg)
  }

  const onResizeStart = () => {
    onInteractionStart()
    resizeRejectedRef.current = false
    lastValidLayoutRef.current = layout
  }

  const onResize = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    void oldItemArg
    if (!newItemArg || typeof newItemArg !== "object") return
    const resized = newItemArg as LayoutItem
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

  const onResizeStop = (layoutArg: unknown) => {
    if (resizeRejectedRef.current) {
      resizeRejectedRef.current = false
      isInteractingRef.current = false
      setIsInteracting(false)
      setIsResizeInvalid(false)
      if (lastValidLayoutRef.current) {
        setManualLayout(lastValidLayoutRef.current)
      }
      return
    }
    commitLayout(layoutArg)
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden bg-black ${isInteracting ? "grid-interacting" : ""} ${
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
        autoSize={false}
        gridConfig={{
          cols: metrics.cols,
          rowHeight: metrics.rowHeight,
          maxRows: metrics.rows,
          margin: [0, 0],
          containerPadding: [0, 0]
        }}
        dragConfig={{ enabled: true, bounded: true, handle: ".drag-handle" }}
        resizeConfig={{ enabled: true, handles: ["n", "s", "e", "w", "ne", "nw", "se", "sw"] }}
        width={metrics.layoutWidth}
        style={{
          height: "100%",
          backgroundColor: "#030712",
          backgroundImage:
            "linear-gradient(to right, rgba(59,130,246,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.12) 1px, transparent 1px)",
          backgroundSize: `${cellWidth}px ${metrics.rowHeight}px`,
          backgroundPosition: "0 0, 0 0"
        }}
        onDragStart={onInteractionStart as any}
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
