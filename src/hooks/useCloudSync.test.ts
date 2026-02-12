import { renderHook, act } from "@testing-library/react"
import { DateCellData } from "../utils/colors"
import { useCloudSync } from "./useCloudSync"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

// ── Module mocks (Jest hoists these before all imports) ─────────────────────

jest.mock("../lib/supabase", () => {
  const mockChannel: Record<string, jest.Mock> = {}
  mockChannel.on = jest.fn().mockReturnValue(mockChannel)
  mockChannel.subscribe = jest.fn().mockReturnValue(mockChannel)

  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn().mockReturnValue(mockChannel),
      removeChannel: jest.fn(),
    },
    __mockChannel: mockChannel,
  }
})

jest.mock("../contexts/AuthContext", () => ({
  useAuth: jest.fn().mockReturnValue({
    user: { id: "user-123", email: "test@example.com" },
  }),
}))

// ── Access mock internals via the mocked module ────────────────────────────

const mockSupa = supabase as any
const { __mockChannel: mockChannelObj } = jest.requireMock("../lib/supabase")

// Individual mock fns we'll reconfigure per test
let mockUpsert: jest.Mock
let mockMaybeSingle: jest.Mock
let realtimeCallbacks: Array<(payload: any) => void>
let subscribedChannels: string[]

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCell(color: string): DateCellData {
  return { color: color as DateCellData["color"] }
}

function makeDateCells(entries: [string, DateCellData][]): Map<string, DateCellData> {
  return new Map(entries)
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers()
  localStorage.clear()

  // Re-configure useAuth (clearAllMocks would reset it)
  ;(useAuth as jest.Mock).mockReturnValue({
    user: { id: "user-123", email: "test@example.com" },
  })

  realtimeCallbacks = []
  subscribedChannels = []

  mockUpsert = jest.fn().mockResolvedValue({ error: null })
  mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })

  // Wire up the Supabase query chain
  mockSupa.from.mockReturnValue({
    upsert: mockUpsert,
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  })

  // Capture Realtime callbacks & channel names
  mockChannelObj.on.mockImplementation((_type: string, _filter: unknown, cb: (p: any) => void) => {
    realtimeCallbacks.push(cb)
    return mockChannelObj
  })
  mockChannelObj.subscribe.mockReturnValue(mockChannelObj)

  mockSupa.channel.mockImplementation((name: string) => {
    subscribedChannels.push(name)
    return mockChannelObj
  })

  mockSupa.removeChannel.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useCloudSync", () => {
  // ── Initial pull ─────────────────────────────────────────────────────────

  describe("initial pull on mount", () => {
    it("pulls from cloud on mount", async () => {
      const cloudData = { "2025-01-01": makeCell("red") }
      mockMaybeSingle.mockResolvedValue({
        data: { data: cloudData, updated_at: "2025-06-01T00:00:00Z" },
        error: null,
      })

      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      expect(mockMaybeSingle).toHaveBeenCalled()
      expect(setDateCells).toHaveBeenCalledWith(new Map(Object.entries(cloudData)))
    })

    it("applies cloud data when local data is empty (localStorage cleared between sessions)", async () => {
      const cloudData = {
        "2025-03-15": makeCell("green"),
        "2025-07-20": makeCell("blue"),
      }
      mockMaybeSingle.mockResolvedValue({
        data: { data: cloudData, updated_at: "2025-06-01T00:00:00Z" },
        error: null,
      })

      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      expect(setDateCells).toHaveBeenCalledWith(new Map(Object.entries(cloudData)))
    })

    it("applies cloud data when cloud timestamp is newer than local", async () => {
      localStorage.setItem("calendar_sync_ts", "2025-01-01T00:00:00Z")

      const cloudData = { "2025-01-01": makeCell("red") }
      mockMaybeSingle.mockResolvedValue({
        data: { data: cloudData, updated_at: "2025-06-01T00:00:00Z" },
        error: null,
      })

      const setDateCells = jest.fn()
      const existingCells = makeDateCells([["2025-01-01", makeCell("blue")]])

      renderHook(() => useCloudSync(2025, existingCells, setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      expect(setDateCells).toHaveBeenCalledWith(new Map(Object.entries(cloudData)))
    })

    it("does NOT overwrite local data when local timestamp matches cloud", async () => {
      const ts = "2025-06-01T00:00:00Z"
      localStorage.setItem("calendar_sync_ts", ts)

      mockMaybeSingle.mockResolvedValue({
        data: { data: { "2025-01-01": makeCell("red") }, updated_at: ts },
        error: null,
      })

      const setDateCells = jest.fn()
      const existingCells = makeDateCells([["2025-01-01", makeCell("blue")]])

      renderHook(() => useCloudSync(2025, existingCells, setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      expect(setDateCells).not.toHaveBeenCalled()
    })
  })

  // ── Auto-push ────────────────────────────────────────────────────────────

  describe("auto-push", () => {
    it("does NOT push empty dateCells to cloud (prevents overwriting cloud on fresh localStorage)", async () => {
      renderHook(() => useCloudSync(2025, new Map(), jest.fn()))

      await act(async () => {
        await Promise.resolve()
      })

      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(mockUpsert).not.toHaveBeenCalled()
    })

    it("does NOT auto-push before initial pull completes", async () => {
      // Pull hangs indefinitely
      mockMaybeSingle.mockReturnValue(new Promise(() => {}))

      const dateCells = makeDateCells([["2025-01-01", makeCell("red")]])

      renderHook(() => useCloudSync(2025, dateCells, jest.fn()))

      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(mockUpsert).not.toHaveBeenCalled()
    })

    it("pushes after initial pull completes and dateCells change", async () => {
      const setDateCells = jest.fn()

      const { rerender } = renderHook(
        ({ cells }) => useCloudSync(2025, cells, setDateCells),
        { initialProps: { cells: new Map<string, DateCellData>() } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      // User changes dateCells
      rerender({ cells: makeDateCells([["2025-01-01", makeCell("red")]]) })

      await act(async () => {
        jest.advanceTimersByTime(600)
        await Promise.resolve()
      })

      expect(mockUpsert).toHaveBeenCalledTimes(1)
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          year: 2025,
          data: { "2025-01-01": makeCell("red") },
        }),
        { onConflict: "user_id,year" }
      )
    })

    it("debounces rapid changes — only pushes once", async () => {
      const { rerender } = renderHook(
        ({ cells }) => useCloudSync(2025, cells, jest.fn()),
        { initialProps: { cells: new Map<string, DateCellData>() } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      // 3 rapid changes within debounce window
      rerender({ cells: makeDateCells([["2025-01-01", makeCell("red")]]) })
      act(() => { jest.advanceTimersByTime(200) })

      rerender({ cells: makeDateCells([["2025-01-01", makeCell("red")], ["2025-01-02", makeCell("blue")]]) })
      act(() => { jest.advanceTimersByTime(200) })

      rerender({ cells: makeDateCells([["2025-01-01", makeCell("red")], ["2025-01-02", makeCell("blue")], ["2025-01-03", makeCell("green")]]) })

      await act(async () => {
        jest.advanceTimersByTime(600)
        await Promise.resolve()
      })

      expect(mockUpsert).toHaveBeenCalledTimes(1)
    })
  })

  // ── Realtime subscription ────────────────────────────────────────────────

  describe("Realtime subscription", () => {
    it("increments channel name suffix when effect re-runs (StrictMode safety)", async () => {
      // channelIdRef increments each time the Realtime effect runs,
      // ensuring unique channel names when React StrictMode unmounts/remounts effects.
      const { rerender } = renderHook(
        ({ yr }) => useCloudSync(yr, new Map(), jest.fn()),
        { initialProps: { yr: 2025 } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      expect(subscribedChannels[0]).toMatch(/^calendar-sync-2025-\d+$/)
      const firstSuffix = subscribedChannels[0].split("-").pop()

      // Change year → effect cleanup + re-run → new channel with incremented suffix
      rerender({ yr: 2026 })

      await act(async () => {
        await Promise.resolve()
      })

      const lastChannel = subscribedChannels[subscribedChannels.length - 1]
      expect(lastChannel).toMatch(/^calendar-sync-2026-\d+$/)
      const secondSuffix = lastChannel.split("-").pop()

      expect(Number(secondSuffix)).toBeGreaterThan(Number(firstSuffix))
    })

    it("removes channel on unmount", async () => {
      const { unmount } = renderHook(() => useCloudSync(2025, new Map(), jest.fn()))

      await act(async () => {
        await Promise.resolve()
      })

      unmount()

      expect(mockSupa.removeChannel).toHaveBeenCalled()
    })

    it("ignores own Realtime events — handles Z vs +00:00 timestamp format", async () => {
      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      // Simulate: we pushed with JS toISOString() "Z" suffix
      localStorage.setItem("calendar_sync_ts", "2025-06-01T12:00:00.000Z")

      // Supabase Realtime echoes the same instant with "+00:00" suffix
      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      expect(cb).toBeDefined()

      act(() => {
        cb({
          new: {
            year: 2025,
            data: { "2025-01-01": makeCell("red") },
            updated_at: "2025-06-01T12:00:00.000+00:00",
          },
        })
      })

      // Should NOT apply — same timestamp, just different format
      expect(setDateCells).not.toHaveBeenCalled()
    })

    it("applies Realtime events from OTHER devices", async () => {
      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      const otherDeviceData = {
        "2025-03-15": makeCell("green"),
        "2025-07-20": makeCell("blue"),
      }

      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      act(() => {
        cb({
          new: {
            year: 2025,
            data: otherDeviceData,
            updated_at: "2025-06-01T12:00:00.000+00:00",
          },
        })
      })

      expect(setDateCells).toHaveBeenCalledWith(new Map(Object.entries(otherDeviceData)))
    })

    it("ignores Realtime events for a different year", async () => {
      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      act(() => {
        cb({
          new: {
            year: 2024,
            data: { "2024-01-01": makeCell("red") },
            updated_at: "2025-06-01T12:00:00.000+00:00",
          },
        })
      })

      expect(setDateCells).not.toHaveBeenCalled()
    })

    it("ignores Realtime events with empty data", async () => {
      const setDateCells = jest.fn()

      renderHook(() => useCloudSync(2025, new Map(), setDateCells))

      await act(async () => {
        await Promise.resolve()
      })

      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      act(() => {
        cb({
          new: {
            year: 2025,
            data: {},
            updated_at: "2025-06-01T12:00:00.000+00:00",
          },
        })
      })

      expect(setDateCells).not.toHaveBeenCalled()
    })
  })

  // ── Realtime echo prevention ─────────────────────────────────────────────

  describe("Realtime echo prevention (isFromRealtimeRef)", () => {
    it("does NOT auto-push data that arrived from Realtime", async () => {
      const setDateCells = jest.fn()

      const { rerender } = renderHook(
        ({ cells }) => useCloudSync(2025, cells, setDateCells),
        { initialProps: { cells: new Map<string, DateCellData>() } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      // Realtime event from another device
      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      const realtimeData = { "2025-03-15": makeCell("green") }

      act(() => {
        cb({
          new: {
            year: 2025,
            data: realtimeData,
            updated_at: "2025-06-01T12:30:00.000+00:00",
          },
        })
      })

      // Simulate React re-render with the data that came from Realtime
      rerender({ cells: new Map(Object.entries(realtimeData)) })

      await act(async () => {
        jest.advanceTimersByTime(1000)
        await Promise.resolve()
      })

      // Must NOT push — this would echo data back and cause a feedback loop
      expect(mockUpsert).not.toHaveBeenCalled()
    })

    it("DOES auto-push user's LOCAL changes made after Realtime data was applied", async () => {
      const setDateCells = jest.fn()

      const { rerender } = renderHook(
        ({ cells }) => useCloudSync(2025, cells, setDateCells),
        { initialProps: { cells: new Map<string, DateCellData>() } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      // 1) Realtime event arrives
      const cb = realtimeCallbacks[realtimeCallbacks.length - 1]
      act(() => {
        cb({
          new: {
            year: 2025,
            data: { "2025-03-15": makeCell("green") },
            updated_at: "2025-06-01T12:30:00.000+00:00",
          },
        })
      })

      // 2) Re-render with Realtime data (should be skipped)
      rerender({ cells: makeDateCells([["2025-03-15", makeCell("green")]]) })

      await act(async () => {
        jest.advanceTimersByTime(600)
        await Promise.resolve()
      })

      expect(mockUpsert).not.toHaveBeenCalled()

      // 3) User makes a LOCAL change
      rerender({
        cells: makeDateCells([
          ["2025-03-15", makeCell("green")],
          ["2025-03-16", makeCell("red")],
        ]),
      })

      await act(async () => {
        jest.advanceTimersByTime(600)
        await Promise.resolve()
      })

      // THIS must push — it's a genuine user action
      expect(mockUpsert).toHaveBeenCalledTimes(1)
    })
  })

  // ── syncStatus ───────────────────────────────────────────────────────────

  describe("syncStatus", () => {
    it("shows 'pulling' during pull, then 'idle'", async () => {
      let resolvePull!: () => void
      mockMaybeSingle.mockReturnValue(
        new Promise((resolve) => {
          resolvePull = () => resolve({ data: null, error: null })
        })
      )

      const { result } = renderHook(() => useCloudSync(2025, new Map(), jest.fn()))

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.syncStatus).toBe("pulling")

      await act(async () => {
        resolvePull()
        await Promise.resolve()
      })

      expect(result.current.syncStatus).toBe("idle")
    })

    it("sets 'error' on pull failure", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "network error" } })

      const { result } = renderHook(() => useCloudSync(2025, new Map(), jest.fn()))

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.syncStatus).toBe("error")
    })

    it("sets 'error' on push failure", async () => {
      mockUpsert.mockResolvedValue({ error: { message: "push failed" } })

      const { result, rerender } = renderHook(
        ({ cells }) => useCloudSync(2025, cells, jest.fn()),
        { initialProps: { cells: new Map<string, DateCellData>() } }
      )

      await act(async () => {
        await Promise.resolve()
      })

      rerender({ cells: makeDateCells([["2025-01-01", makeCell("red")]]) })

      await act(async () => {
        jest.advanceTimersByTime(600)
        await Promise.resolve()
      })

      expect(result.current.syncStatus).toBe("error")
    })
  })

  // ── Returned API ─────────────────────────────────────────────────────────

  describe("returned API", () => {
    it("exposes pushToCloud and pullFromCloud functions", async () => {
      const { result } = renderHook(() => useCloudSync(2025, new Map(), jest.fn()))

      await act(async () => {
        await Promise.resolve()
      })

      expect(typeof result.current.pushToCloud).toBe("function")
      expect(typeof result.current.pullFromCloud).toBe("function")
    })
  })
})
