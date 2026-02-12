import React, { useRef } from "react"
import { useCalendar } from "../contexts/CalendarContext"
import { useAuth } from "../contexts/AuthContext"
import { UI_COLORS } from "../utils/colors"

const CloudIcon: React.FC<{ status: "idle" | "syncing" | "error" }> = ({ status }) => {
  const color = status === "error" ? "#e74c3c" : status === "syncing" ? "#3498db" : "#27ae60"
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={status === "syncing" ? "sync-spin" : undefined}
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      {status === "idle" && <polyline points="9 14 12 11 15 14" />}
      {status === "error" && (
        <>
          <line x1="12" y1="13" x2="12" y2="16" />
          <circle cx="12" cy="18" r="0.5" fill={color} />
        </>
      )}
    </svg>
  )
}

const SaveLoadData: React.FC = () => {
  const {
    selectedYear,
    dateCells,
    selectedColorTexture,
    selectedView,
    setDateCells,
    setSelectedYear,
    setSelectedColorTexture,
    setSelectedView,
    syncStatus,
    pullFromCloud,
    pushToCloud,
  } = useCalendar()

  const { user } = useAuth()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAuthenticated = user !== null
  const isSyncing = syncStatus === "pushing" || syncStatus === "pulling"

  const handleSyncNow = async () => {
    await pullFromCloud()
    await pushToCloud()
  }

  const handleSaveData = () => {
    const dataToSave = {
      selectedYear,
      dateCells: Object.fromEntries(dateCells),
      selectedColorTexture,
      selectedView,
      exportDate: new Date().toISOString(),
      version: "2.0",
    }

    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `year-planner-data-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleLoadData = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const loadedData = JSON.parse(e.target?.result as string)

        if (!loadedData || typeof loadedData !== "object") {
          alert("Invalid data file format")
          return
        }

        if (loadedData.dateCells && typeof loadedData.dateCells === "object") {
          const newDateCells = new Map(dateCells)

          Object.entries(loadedData.dateCells).forEach(([dateKey, cellData]) => {
            const existing = newDateCells.get(dateKey) || {}
            newDateCells.set(dateKey, {
              ...existing,
              ...(cellData as any),
            })
          })
          setDateCells(newDateCells)
        }

        if (loadedData.selectedYear && typeof loadedData.selectedYear === "number") {
          setSelectedYear(loadedData.selectedYear)
        }
        if (loadedData.selectedColorTexture && typeof loadedData.selectedColorTexture === "string") {
          setSelectedColorTexture(loadedData.selectedColorTexture)
        }
        if (loadedData.selectedView && ["Linear", "Classic", "Column"].includes(loadedData.selectedView)) {
          setSelectedView(loadedData.selectedView)
        }

        const mergedDateCells = loadedData.dateCells
          ? (() => {
              const newDateCells = new Map(dateCells)
              Object.entries(loadedData.dateCells).forEach(([dateKey, cellData]) => {
                const existing = newDateCells.get(dateKey) || {}
                newDateCells.set(dateKey, {
                  ...existing,
                  ...(cellData as any),
                })
              })
              return Object.fromEntries(newDateCells)
            })()
          : Object.fromEntries(dateCells)

        const dataToSave = {
          selectedYear: loadedData.selectedYear || selectedYear,
          dateCells: mergedDateCells,
          selectedColorTexture: loadedData.selectedColorTexture || selectedColorTexture,
          selectedView: loadedData.selectedView || selectedView,
        }
        localStorage.setItem("calendar_data", JSON.stringify(dataToSave))
      } catch (error) {
        alert("Error loading data: Invalid JSON format")
        console.error("Error parsing loaded data:", error)
      }
    }
    reader.readAsText(file)

    event.target.value = ""
  }

  const handleCleanAll = () => {
    if (window.confirm("Are you sure you want to delete all data? This action cannot be undone.")) {
      setDateCells(new Map())
      setSelectedYear(new Date().getFullYear())
      setSelectedColorTexture("red")
      setSelectedView("Linear")

      localStorage.removeItem("calendar_data")
    }
  }

  const renderSyncIndicator = () => {
    if (!isAuthenticated || syncStatus === "offline") return null

    let tooltipText = ""
    let iconStatus: "idle" | "syncing" | "error" = "idle"

    if (syncStatus === "idle") {
      tooltipText = "Synced to cloud"
      iconStatus = "idle"
    } else if (isSyncing) {
      tooltipText = "Syncing..."
      iconStatus = "syncing"
    } else if (syncStatus === "error") {
      tooltipText = "Sync failed"
      iconStatus = "error"
    }

    return (
      <span
        title={tooltipText}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 12px",
          fontSize: "13px",
          color: iconStatus === "error" ? "#e74c3c" : iconStatus === "syncing" ? "#3498db" : "#27ae60",
          borderRadius: "6px",
          backgroundColor: iconStatus === "error" ? "#fdecea" : iconStatus === "syncing" ? "#eaf4fd" : "#eafaf1",
        }}
      >
        <CloudIcon status={iconStatus} />
        {isSyncing && "Syncing..."}
        {syncStatus === "error" && "Sync failed"}
      </span>
    )
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          marginTop: "30px",
          padding: "20px",
          borderTop: `1px solid ${UI_COLORS.border.tertiary}`,
        }}
      >
        <button
          onClick={handleSaveData}
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "bold",
            backgroundColor: UI_COLORS.button.primary.normal,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            touchAction: "auto",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.primary.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.primary.normal
          }}
        >
          Save Data...
        </button>

        <button
          onClick={handleLoadData}
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "bold",
            backgroundColor: UI_COLORS.button.success.normal,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            touchAction: "auto",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.success.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.success.normal
          }}
        >
          Load Data
        </button>

        <button
          onClick={handleCleanAll}
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "bold",
            backgroundColor: UI_COLORS.button.danger.normal,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            touchAction: "auto",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.danger.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = UI_COLORS.button.danger.normal
          }}
        >
          Clean All
        </button>

        {isAuthenticated && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            style={{
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: "bold",
              backgroundColor: isSyncing ? "#95a5a6" : "#3498db",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: isSyncing ? "not-allowed" : "pointer",
              transition: "background-color 0.2s ease",
              touchAction: "auto",
            }}
            onMouseEnter={(e) => {
              if (!isSyncing) {
                e.currentTarget.style.backgroundColor = "#2980b9"
              }
            }}
            onMouseLeave={(e) => {
              if (!isSyncing) {
                e.currentTarget.style.backgroundColor = "#3498db"
              }
            }}
          >
            Sync Now
          </button>
        )}

        {renderSyncIndicator()}

        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: "none" }} />
      </div>

      <div
        style={{
          color: UI_COLORS.text.secondary,
          textAlign: "center",
          maxWidth: "800px",
          margin: "0 auto",
          padding: "20px",
        }}
      >
        <p style={{ fontSize: "16px" }}>
          All changes on this page are saved locally in your browser. This page doesn't use any servers and works
          offline.
        </p>
        <p style={{ fontSize: "13px", paddingTop: "20px" }}>
          However, some browsers may occasionally delete your local storage to "save space", so we strongly recommend
          saving them to your hard drive using the buttons above.
        </p>
        <p style={{ fontSize: "13px", paddingBottom: "100px" }}>
          Ideas, bugs and feature requests — <a href="https://github.com/vas3k/year.vas3k.cloud">on GitHub</a>.
        </p>
      </div>
    </>
  )
}

export default SaveLoadData
