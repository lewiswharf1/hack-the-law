/*
  Routing + auth gate (CLAUDE.md §15.2).

  Auth model: a single bearer token in localStorage. Any route except /login is
  guarded by <RequireAuth>; with no token the user is bounced to /login. This is
  identical whether the API is mocked or real — only api.login() differs.
*/
import { Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "./components/Layout"
import Login from "./pages/Login"
import CasesList from "./pages/CasesList"
import CaseSetup from "./pages/CaseSetup"
import CaseWorkspace from "./pages/CaseWorkspace"

function isAuthed() {
  return Boolean(localStorage.getItem("token"))
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/cases"
        element={
          <RequireAuth>
            <CasesList />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/:caseId/setup"
        element={
          <RequireAuth>
            <CaseSetup />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/:caseId"
        element={
          <RequireAuth>
            <CaseWorkspace />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to={isAuthed() ? "/cases" : "/login"} replace />} />
    </Routes>
  )
}
