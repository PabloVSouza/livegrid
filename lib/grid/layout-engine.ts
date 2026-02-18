export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  static?: boolean
}

export interface GridMetrics {
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

export const loadStoredManualLayout = (storageKey: string): LayoutItem[] | null => {
  if (typeof window === 'undefined') return null

  try {
    return parseStoredLayout(localStorage.getItem(storageKey))
  } catch {
    return null
  }
}

export const saveStoredManualLayout = (storageKey: string, layout: LayoutItem[] | null): void => {
  if (typeof window === 'undefined') return
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

export const migrateLegacyManualLayout = (legacyKey: string, modeKey: string): LayoutItem[] | null => {
  if (typeof window === 'undefined') return null

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

export const computeGridMetrics = (width: number, height: number, itemCount: number): GridMetrics => {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const isMobile = safeWidth < 768
  const chromeX = STREAM_FRAME_WIDTH_PX
  const chromeY = STREAM_CHROME_HEIGHT_PX + STREAM_FRAME_HEIGHT_PX

  const tileWidthFromRowHeight = (rowHeight: number): number =>
    Math.max(1, Math.max(1, rowHeight - chromeY) * TARGET_ASPECT + chromeX)

  const rowHeightFromColWidth = (colWidth: number): number =>
    Math.max(1, Math.max(1, colWidth - chromeX) / TARGET_ASPECT + chromeY)

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

  const rows = Math.max(1, Math.floor(safeHeight / TARGET_ROW_PX))
  const rowHeight = safeHeight / rows
  const targetTileWidth = tileWidthFromRowHeight(rowHeight)
  const cols = Math.max(1, Math.floor(safeWidth / targetTileWidth))

  return {
    width: safeWidth,
    layoutWidth: safeWidth,
    height: safeHeight,
    contentHeight: safeHeight,
    cols,
    rows,
    rowHeight,
    isMobile
  }
}

const intersects = (a: LayoutItem, b: LayoutItem): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const hasOverlap = (layout: LayoutItem[]): boolean => {
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

export const hasOutOfBounds = (layout: LayoutItem[], metrics: GridMetrics): boolean =>
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
): Pick<LayoutItem, 'x' | 'y'> => {
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
      return a.y - b.y || a.x - b.x
    })

  const placed: LayoutItem[] = []
  for (const raw of filtered) {
    const fitted =
      prioritizedItemId && raw.i === prioritizedItemId
        ? (() => {
            const pinned = clampLayoutItem(raw, metrics)
            const slot = findOpenSlot(pinned, placed, metrics)
            return { ...pinned, ...slot }
          })()
        : fitItemIntoGrid(raw, placed, metrics)
    placed.push(fitted)
  }

  return placed
}

export const repairLayoutToVisible = (
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

export const resolveResizeWithMinimalMoves = (
  layout: LayoutItem[],
  streamIds: Set<string>,
  metrics: GridMetrics,
  activeId?: string | null
): LayoutItem[] => {
  const sanitized = sanitizeLayoutFromGrid(layout, streamIds, metrics)
  if (!activeId) return sanitized

  const active = sanitized.find((item) => item.i === activeId)
  if (!active) return sanitized

  const ordered = sanitized.filter((item) => item.i !== activeId).sort((a, b) => a.y - b.y || a.x - b.x)

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

  for (const id of streamIds) {
    if (placedIds.has(id)) continue
    const fallback = fitItemIntoGrid({ i: id, x: 0, y: 0, w: 1, h: 1 }, placed, metrics)
    placed.push(fallback)
  }

  return placed
}

export const sanitizeLayoutFromGrid = (
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

export const packMobileNoGaps = (layout: LayoutItem[], streamIds: Set<string>): LayoutItem[] => {
  const unique = new Set<string>()
  return layout
    .filter((item) => streamIds.has(item.i))
    .filter((item) => {
      if (unique.has(item.i)) return false
      unique.add(item.i)
      return true
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item, index) => ({
      ...item,
      x: 0,
      y: index,
      w: 1,
      h: 1
    }))
}

export const buildLayoutPreservingManual = (
  streamIdsInOrder: string[],
  manualLayout: LayoutItem[] | null,
  defaultLayout: LayoutItem[],
  metrics: GridMetrics
): LayoutItem[] => {
  const streamIds = new Set(streamIdsInOrder)
  const manualSanitized = manualLayout ? sanitizeLayoutFromGrid(manualLayout, streamIds, metrics) : []
  const placed: LayoutItem[] = [...manualSanitized]
  const usedIds = new Set(placed.map((item) => item.i))
  const defaultsById = new Map(defaultLayout.map((item) => [item.i, item]))

  for (const streamId of streamIdsInOrder) {
    if (usedIds.has(streamId)) continue
    const fallback = defaultsById.get(streamId)
    if (!fallback) continue
    const fitted = fitItemIntoGrid(clampLayoutItem(fallback, metrics), placed, metrics)
    placed.push(fitted)
    usedIds.add(streamId)
  }

  return placed
}

export const buildEvenLayout = (streamIds: string[], metrics: GridMetrics): LayoutItem[] => {
  if (streamIds.length === 0) return []

  const placed: LayoutItem[] = []
  const totalCells = metrics.cols * metrics.rows

  for (let index = 0; index < streamIds.length; index += 1) {
    const streamId = streamIds[index]
    const remainingItems = streamIds.length - index
    const usedCells = placed.reduce((sum, item) => sum + item.w * item.h, 0)
    const freeCells = Math.max(1, totalCells - usedCells)
    const targetAreaPerItem = Math.max(1, Math.floor(freeCells / Math.max(1, remainingItems)))
    const targetSize = Math.max(1, Math.floor(Math.sqrt(targetAreaPerItem)))
    const seed: LayoutItem = {
      i: streamId,
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

export const buildDefaultDesktopLayout = (streamIds: string[], metrics: GridMetrics): LayoutItem[] => {
  const rowCounts = buildRowCounts(streamIds.length, metrics.rows)
  const rowsToUse = rowCounts.length || 1
  const rowHeights = buildRowHeights(rowsToUse, metrics.rows)

  let cursor = 0
  let yOffset = 0

  return rowCounts.flatMap((count, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? 1
    const colWidths = Array.from({ length: count }, (_, idx) =>
      idx < metrics.cols % count ? Math.ceil(metrics.cols / count) : Math.floor(metrics.cols / count)
    )

    let xOffset = 0
    const items = colWidths.map((colWidth) => {
      const streamId = streamIds[cursor]
      cursor += 1
      const layout = {
        i: streamId,
        x: xOffset,
        y: yOffset,
        w: Math.max(1, colWidth),
        h: Math.max(1, rowHeight),
        static: false
      }
      xOffset += colWidth
      return layout
    })

    yOffset += rowHeight
    return items
  })
}
