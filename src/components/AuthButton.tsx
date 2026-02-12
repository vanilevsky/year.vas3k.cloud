import React, { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { UI_COLORS } from "../utils/colors"

const AuthButton: React.FC = () => {
  const { user, loading, signIn, signUp, signOut } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return null
  }

  const handleSubmit = async (mode: "signin" | "signup") => {
    setError(null)
    setSubmitting(true)
    const result = mode === "signin"
      ? await signIn(email, password)
      : await signUp(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setShowForm(false)
      setEmail("")
      setPassword("")
    }
  }

  if (!user) {
    if (!showForm) {
      return (
        <div className="no-print auth-button-container">
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "bold",
              backgroundColor: UI_COLORS.border.primary,
              color: UI_COLORS.text.white,
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = UI_COLORS.border.inset
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = UI_COLORS.border.primary
            }}
          >
            Sign in
          </button>
        </div>
      )
    }

    return (
      <div className="no-print auth-button-container">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit("signin")}
            style={{
              padding: "6px 10px",
              fontSize: "13px",
              border: `1px solid ${UI_COLORS.border.tertiary}`,
              borderRadius: "6px",
              outline: "none",
              width: "160px",
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit("signin")}
            style={{
              padding: "6px 10px",
              fontSize: "13px",
              border: `1px solid ${UI_COLORS.border.tertiary}`,
              borderRadius: "6px",
              outline: "none",
              width: "120px",
            }}
          />
          <button
            onClick={() => handleSubmit("signin")}
            disabled={submitting}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              backgroundColor: UI_COLORS.border.primary,
              color: UI_COLORS.text.white,
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
          <button
            onClick={() => handleSubmit("signup")}
            disabled={submitting}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              backgroundColor: "transparent",
              color: UI_COLORS.text.secondary,
              border: `1px solid ${UI_COLORS.border.tertiary}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Sign up
          </button>
          <button
            onClick={() => { setShowForm(false); setError(null) }}
            style={{
              padding: "6px 8px",
              fontSize: "12px",
              backgroundColor: "transparent",
              color: UI_COLORS.text.secondary,
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <div style={{ color: "red", fontSize: "12px", marginTop: "4px" }}>
            {error}
          </div>
        )}
      </div>
    )
  }

  const email_display = user.email ?? ""
  const initial = (email_display[0] ?? "?").toUpperCase()

  return (
    <div className="no-print auth-button-container">
      <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            backgroundColor: UI_COLORS.button.primary.normal,
            color: UI_COLORS.text.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: "bold",
          }}
        >
          {initial}
        </div>
        <span style={{ fontSize: "13px", color: UI_COLORS.text.secondary }}>
          {email_display}
        </span>
        <button
          onClick={signOut}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: "bold",
            backgroundColor: "transparent",
            color: UI_COLORS.text.secondary,
            border: `1px solid ${UI_COLORS.border.tertiary}`,
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export default AuthButton
