import ArenaApp from "./ArenaApp.js"
import LibraryApp from "./LibraryApp.js"
import McpStudioApp from "./McpStudioApp.js"
import PetApp from "./PetApp.js"
import { useEffect, useState } from "react"

function usePath() {
  const [path, setPath] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"))

  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onChange)
    window.addEventListener("pushstate", onChange as EventListener)
    return () => {
      window.removeEventListener("popstate", onChange)
      window.removeEventListener("pushstate", onChange as EventListener)
    }
  }, [])

  return path
}

export default function App() {
  const path = usePath()

  if (path === "/library" || path === "/library/") return <LibraryApp />
  if (path === "/pet" || path === "/pet/") return <PetApp />
  if (path === "/arena" || path === "/arena/") return <ArenaApp />

  return <McpStudioApp />
}
