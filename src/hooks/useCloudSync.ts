import { useCallback, useEffect, useRef, useState } from "react"
import { DateCellData } from "../utils/colors"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

export type SyncStatus = "idle" | "pushing" | "pulling" | "error" | "offline"

const SYNC_TS_KEY = "calendar_sync_ts"
const DEBOUNCE_MS = 500

function getSyncTimestamp(): string | null {
  try {
    return localStorage.getItem(SYNC_TS_KEY)
  } catch {
    return null
  }
}

function setSyncTimestamp(ts: string): void {
  try {
    localStorage.setItem(SYNC_TS_KEY, ts)
  } catch (error) {
    console.error("Error saving sync timestamp to localStorage:", error)
  }
}

export function useCloudSync(
  year: number,
  dateCells: Map<string, DateCellData>,
  setDateCells: (dateCells: Map<string, DateCellData>) => void
) {
  const { user } = useAuth()
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")

  // Refs to avoid stale closures in debounced effect
  const dateCellsRef = useRef(dateCells)
  dateCellsRef.current = dateCells

  // Ref for setDateCells to keep pullFromCloud callback stable
  const setDateCellsRef = useRef(setDateCells)
  setDateCellsRef.current = setDateCells

  const isPushingRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When true, the next dateCells change came from Realtime and should not auto-push
  const isFromRealtimeRef = useRef(false)

  // Track whether the initial pull has completed to avoid
  // the auto-push firing on data that just came from the cloud
  const initialPullDoneRef = useRef(false)

  const isEnabled = supabase !== null && user !== null

  const pushToCloud = useCallback(async () => {
    if (!supabase || !user) return

    isPushingRef.current = true
    setSyncStatus("pushing")
    try {
      const now = new Date().toISOString()
      const dataObj = Object.fromEntries(dateCellsRef.current)

      const { error } = await supabase.from("calendar_states").upsert(
        {
          user_id: user.id,
          year,
          data: dataObj,
          updated_at: now,
        },
        { onConflict: "user_id,year" }
      )

      if (error) {
        console.error("Cloud push error:", error)
        setSyncStatus("error")
      } else {
        setSyncTimestamp(now)
        setSyncStatus("idle")
      }
    } catch (error) {
      console.error("Cloud push failed:", error)
      setSyncStatus("error")
    } finally {
      isPushingRef.current = false
    }
  }, [user, year])

  const pullFromCloud = useCallback(async () => {
    if (!supabase || !user) return

    setSyncStatus("pulling")
    try {
      const { data, error } = await supabase
        .from("calendar_states")
        .select("data, updated_at")
        .eq("user_id", user.id)
        .eq("year", year)
        .maybeSingle()

      if (error) {
        console.error("Cloud pull error:", error)
        setSyncStatus("error")
        return
      }

      if (data) {
        const cloudData = data.data as Record<string, DateCellData>
        const cloudEntries = Object.entries(cloudData)

        // Only apply cloud data if it's non-empty
        if (cloudEntries.length > 0) {
          const localTs = getSyncTimestamp()
          const cloudTs = data.updated_at as string

          // Replace local state if cloud is newer, no local timestamp exists,
          // or local data is empty (e.g. localStorage was cleared between sessions)
          if (!localTs || cloudTs > localTs || dateCellsRef.current.size === 0) {
            const dateCellsMap = new Map(cloudEntries)
            setDateCellsRef.current(dateCellsMap)
            setSyncTimestamp(cloudTs)
          }
        }
      }

      setSyncStatus("idle")
    } catch (error) {
      console.error("Cloud pull failed:", error)
      setSyncStatus("error")
    }
  }, [user, year])

  // Auto-pull on mount and when year changes
  useEffect(() => {
    if (!isEnabled) return

    initialPullDoneRef.current = false
    pullFromCloud().then(() => {
      initialPullDoneRef.current = true
    })
  }, [isEnabled, pullFromCloud])

  // Realtime subscription — apply changes pushed from other devices
  // Unique suffix avoids stale-channel issues when React StrictMode
  // unmounts and remounts the effect.
  const channelIdRef = useRef(0)

  useEffect(() => {
    if (!supabase || !user || !isEnabled) return

    const channelName = `calendar-sync-${year}-${++channelIdRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_states",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { year: number; data: Record<string, DateCellData>; updated_at: string }
          if (row.year !== year) return

          // Ignore our own pushes — compare as Date to handle format
          // differences (JS uses "Z" suffix, Supabase returns "+00:00")
          const localTs = getSyncTimestamp()
          if (localTs && new Date(row.updated_at).getTime() === new Date(localTs).getTime()) return

          const entries = Object.entries(row.data)
          if (entries.length === 0) return

          isFromRealtimeRef.current = true
          setDateCellsRef.current(new Map(entries))
          setSyncTimestamp(row.updated_at)
        }
      )
      .subscribe()

    return () => {
      supabase!.removeChannel(channel)
    }
  }, [isEnabled, user, year])

  // Auto-push with debounce when dateCells change
  useEffect(() => {
    if (!isEnabled) return
    if (!initialPullDoneRef.current) return
    if (isPushingRef.current) return
    // Data arrived from Realtime — don't echo it back
    if (isFromRealtimeRef.current) {
      isFromRealtimeRef.current = false
      return
    }
    // Never push empty data to cloud — protects against overwriting
    // cloud state when localStorage was cleared between sessions
    if (dateCells.size === 0) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      pushToCloud()
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [isEnabled, dateCells, pushToCloud])

  return {
    syncStatus,
    pushToCloud,
    pullFromCloud,
  }
}
