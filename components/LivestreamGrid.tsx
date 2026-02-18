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
  onSelectSource: (livestreamId: string, sourceId: string) => void
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

const hasOverlap = (layout: LayoutItem[]): boolean => {
  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      if (intersects(layout[i], layout[j])) {
        return true
      }
    }
  }
  return false
}

const isInsideVisibleGrid = (item: LayoutItem, metrics: GridMetrics): boolean =>
  item.x >= 0 &&
  item.y >= 0 &&
  item.w >= 1 &&
  item.h >= 1 &&
  item.x + item.w <= metrics.cols &&
  item.y + item.h <= metrics.rows

const hasOutOfBounds = (layout: LayoutItem[], metrics: GridMetrics): boolean =>
  layout.some((item) => !isInsideVisibleGrid(item, metrics))

const shrinkLargestItem = (layout: LayoutItem[]): LayoutItem[] => {
  if (layout.length === 0) return layout

  let largestIndex = 0
  let largestArea = layout[0].w * layout[0].h
  for (let i = 1; i < layout.length; i += 1) {
    const area = layout[i].w * layout[i].h
    if (area > largestArea) {
      largestArea = area
      largestIndex = i
    }
  }

  const next = [...layout]
  const largest = next[largestIndex]
  if (largest.w > 1) {
    next[largestIndex] = { ...largest, w: largest.w - 1 }
  } else if (largest.h > 1) {
    next[largestIndex] = { ...largest, h: largest.h - 1 }
  }
  return next
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
  const base = clampLayoutItem(item, metrics)
  const desiredX = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, metrics.cols - 1))
  const desiredY = Math.min(Math.max(0, Math.round(item.y)), Math.max(0, metrics.rows - 1))
  const widthCandidates: number[] = []
  const heightCandidates: number[] = []

  for (let w = base.w; w >= 1; w -= 1) widthCandidates.push(w)

  const maxHeightAtDesiredY = Math.max(1, metrics.rows - desiredY)
  const preferredStartH = Math.min(base.h, maxHeightAtDesiredY)
  for (let h = preferredStartH; h >= 1; h -= 1) heightCandidates.push(h)
  for (let h = base.h; h > preferredStartH; h -= 1) heightCandidates.push(h)

  for (const w of widthCandidates) {
    for (const h of heightCandidates) {
      const candidate = clampLayoutItem({ ...base, x: desiredX, y: desiredY, w, h }, metrics)
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
            const pinned = clampLayoutItem(raw, metrics)
            const slot = findOpenSlot(pinned, placed, metrics)
            return { ...pinned, ...slot }
          })()
        : fitItemIntoGrid(raw, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

const repairLayoutToVisible = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics,
  prioritizedItemId?: string | null
): LayoutItem[] => {
  let working = sanitizeLayoutFromGrid(layout, streamIds, metrics)
  const maxIterations = Math.max(8, working.length * 10)

  for (let i = 0; i < maxIterations; i += 1) {
    const repaired = normalizeLayout(working, streamIds, metrics, prioritizedItemId)
    if (!hasOutOfBounds(repaired, metrics) && !hasOverlap(repaired)) {
      return repaired
    }

    const shrunk = shrinkLargestItem(working)
    const unchanged = shrunk.every(
      (item, index) => item.w === working[index].w && item.h === working[index].h
    )
    working = shrunk
    if (unchanged) {
      return repaired
    }
  }

  return normalizeLayout(working, streamIds, metrics, prioritizedItemId)
}

const resolveResizeWithMinimalMoves = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics,
  activeId?: string | null
): LayoutItem[] => {
  const sanitized = sanitizeLayoutFromGrid(layout, streamIds, metrics)
  if (!activeId) return sanitized

  const active = sanitized.find((item) => item.i === activeId)
  if (!active) return sanitized

  const ordered = sanitized
    .filter((item) => item.i !== activeId)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))

  const placed: LayoutItem[] = [active]
  const placedIds = new Set<string>([active.i])

  for (const item of ordered) {
    const isVisible = isInsideVisibleGrid(item, metrics)
    const collides = placed.some((existing) => intersects(item, existing))
    if (isVisible && !collides) {
      placed.push(item)
      placedIds.add(item.i)
      continue
    }

    const relocated = fitItemIntoGrid(item, placed, metrics)
    placed.push(relocated)
    placedIds.add(item.i)
  }

  // In case any item was dropped during transient invalid states, add it back minimally.
  for (const id of streamIds) {
    if (placedIds.has(id)) continue
    const fallback = fitItemIntoGrid({ i: id, x: 0, y: 0, w: 1, h: 1 }, placed, metrics)
    placed.push(fallback)
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
    .map((item) => clampLayoutItem(item, metrics))
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
  const pinned = clampLayoutItem(pinnedItem, metrics)
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
    const candidate = clampLayoutItem({ ...fallback, w: targetSize, h: targetSize }, metrics)
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
  const [interactionMode, setInteractionMode] = useState<"idle" | "drag" | "resize">("idle")
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

  useEffect(() => {
    if (isInteractingRef.current) return
    if (livestreams.length === 0) return

    const streamIds = new Set(livestreams.map((stream) => stream.id))
    if (!hasOutOfBounds(layout, metrics) && !hasOverlap(layout)) return

    const repaired = repairLayoutToVisible(layout, streamIds, metrics)
    const packed = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired

    if (hasOutOfBounds(packed, metrics) || hasOverlap(packed)) return

    setManualLayout(packed)
    saveStoredManualLayout(modeLayoutStorageKey, packed)
    lastValidLayoutRef.current = packed
  }, [layout, livestreams, metrics, modeLayoutStorageKey])

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
    prioritizedId?: string | null,
    resizeGrew = false
  ) => {
    if (!isInteractingRef.current) return
    isInteractingRef.current = false
    setInteractionMode("idle")
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
            const direct = sanitizeLayoutFromGrid(layoutItems, streamIds, metrics)
            if (!hasOutOfBounds(direct, metrics) && !hasOverlap(direct)) {
              return direct
            }

            // If the item was reduced, do not trigger automatic reflow.
            if (!resizeGrew) {
              return direct
            }

            // Reflow only affected items first, keeping unaffected cells untouched when possible.
            const minimal = resolveResizeWithMinimalMoves(layoutItems, streamIds, metrics, activeId)
            if (!hasOutOfBounds(minimal, metrics) && !hasOverlap(minimal)) {
              return minimal
            }

            return repairLayoutToVisible(minimal, streamIds, metrics, activeId)
          })()
        : sanitizeLayoutFromGrid(layoutItems, streamIds, metrics)
    let next = metrics.isMobile ? packMobileNoGaps(nextUnpacked, streamIds) : nextUnpacked
    if (mode === "drag" && (hasOutOfBounds(next, metrics) || hasOverlap(next))) {
      const repaired = repairLayoutToVisible(next, streamIds, metrics, activeId)
      next = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired
    }
    if (mode === "resize" && resizeGrew && (hasOutOfBounds(next, metrics) || hasOverlap(next))) {
      const repaired = repairLayoutToVisible(next, streamIds, metrics, activeId)
      next = metrics.isMobile ? packMobileNoGaps(repaired, streamIds) : repaired
    }
    if (hasOutOfBounds(next, metrics) || hasOverlap(next)) {
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

  const onDragStart = (layoutArg: unknown, oldItemArg: unknown, newItemArg: unknown) => {
    void layoutArg
    void oldItemArg
    onInteractionStart()
    setInteractionMode("drag")
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
    setInteractionMode("resize")
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
      setInteractionMode("idle")
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
