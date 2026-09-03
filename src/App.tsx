import { useState } from 'react'
import TeamsListPage from './components/TeamsListPage'
import TeamEditorPage from './components/TeamEditorPage'
import DexPage from './components/DexPage'
import DamageCalculator from './components/DamageCalculator'
import TeamToolsPage from './components/TeamToolsPage'
import './App.css'

type Tab = 'teams' | 'dex' | 'calc' | 'tools'

function App() {
  // Shared links open straight to the view they point at:
  // ?calc= -> damage calculator, ?dex= / ?mon= -> Pokedex.
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('calc')) return 'calc'
    if (params.has('dex') || params.has('mon')) return 'dex'
    return 'teams'
  })
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)

  function goToTab(next: Tab) {
    setTab(next)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Pokemon Champions Companion</h1>
        <nav className="app-nav">
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => goToTab('teams')}>
            Teams
          </button>
          <button className={tab === 'dex' ? 'active' : ''} onClick={() => goToTab('dex')}>
            Pokedex
          </button>
          <button className={tab === 'tools' ? 'active' : ''} onClick={() => goToTab('tools')}>
            Team Tools
          </button>
          <button className={tab === 'calc' ? 'active' : ''} onClick={() => goToTab('calc')}>
            Damage Calculator
          </button>
        </nav>
      </header>

      {/* Every page stays mounted once visited, and switching tabs just hides
       *  the others - so whatever you were doing on a page (a half-built
       *  damage calc, a scrolled matchup grid) is still there when you come
       *  back to it, instead of resetting on every visit. */}
      <div className={tab === 'teams' ? 'app-page' : 'app-page hidden'}>
        {editingTeamId ? (
          <TeamEditorPage teamId={editingTeamId} onBack={() => setEditingTeamId(null)} />
        ) : (
          <TeamsListPage onOpenTeam={setEditingTeamId} />
        )}
      </div>
      <div className={tab === 'dex' ? 'app-page' : 'app-page hidden'}>
        <DexPage />
      </div>
      <div className={tab === 'tools' ? 'app-page' : 'app-page hidden'}>
        <TeamToolsPage />
      </div>
      <div className={tab === 'calc' ? 'app-page' : 'app-page hidden'}>
        <DamageCalculator />
      </div>
    </div>
  )
}

export default App
