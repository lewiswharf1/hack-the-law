/*
  App shell: top navigation bar (60px) per DESIGN_SYSTEM.md §5 + routed content.
  The auth gate lives in App.tsx; this just renders the chrome around a page.
*/
import { Link, useNavigate } from "react-router-dom"
import type { ReactNode } from "react"

export function TopNav() {
  const navigate = useNavigate()

  function logout() {
    // Mirrors the real flow: clear the bearer token and bounce to /login.
    localStorage.removeItem("token")
    navigate("/login")
  }

  return (
    <header className="h-[60px] flex items-center justify-between px-6 bg-surface border-b border-border">
      <Link to="/cases" className="flex items-center gap-3 no-underline">
        <img src="/logo.png" alt="Donna" className="h-10 w-10 object-contain" />
        <span className="font-serif text-xl text-navy">Donna</span>
      </Link>
      <button
        onClick={logout}
        className="text-sm font-semibold text-muted hover:text-primary cursor-pointer"
      >
        Sign out
      </button>
    </header>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <TopNav />
      <main className="flex-1">{children}</main>
    </div>
  )
}
