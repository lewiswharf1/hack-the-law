/*
  Login gate (CLAUDE.md §15.2). Single pre-seeded user, no registration.
  On success we store the JWT in localStorage and the router redirects to /cases.

  Backend: POST /api/auth/login -> { access_token }. The mock accepts the demo
  credentials from CLAUDE.md §16 (admin / scaffold2026).
*/
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client"
import { Button } from "../components/ui"

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("scaffold2026")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { access_token } = await api.login(username, password)
      localStorage.setItem("token", access_token)
      navigate("/cases")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "w-full rounded-md border border-border px-4 py-3 text-base outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-[420px] rounded-xl bg-surface p-8 shadow-[0_20px_25px_rgba(0,0,0,0.15)]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-navy font-serif text-2xl text-white">
            S
          </span>
          <h1 className="text-4xl text-navy">Scaffold</h1>
          <p className="mt-2 text-sm text-muted">
            Legal argument graphs for EU data law litigation
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-navy">
              Username
            </label>
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-navy">
              Password
            </label>
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Demo credentials are pre-filled · admin / scaffold2026
        </p>
      </div>
    </div>
  )
}
