import { useEffect, useState } from 'react'
import StartHerePage from './components/StartHerePage'
import TeamsListPage from './components/TeamsListPage'
import TeamEditorPage from './components/TeamEditorPage'
import DexPage from './components/DexPage'
import MetaPage from './components/MetaPage'
import TournamentsPage from './components/TournamentsPage'
import DamageCalculator from './components/DamageCalculator'
import TeamToolsPage from './components/TeamToolsPage'
import './App.css'

type Tab = 'start' | 'teams' | 'dex' | 'meta' | 'tournaments' | 'calc' | 'tools'

function App() {
  // Shared links open straight to the view they point at:
  // ?calc= -> damage calculator, ?dex= / ?mon= -> Pokedex, ?meta= -> Meta, ?team= -> that team's editor.
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('calc')) return 'calc'
    if (params.has('meta')) return 'meta'
    if (params.has('dex') || params.has('mon')) return 'dex'
    if (params.has('team')) return 'teams'
    return 'start'
  })
  const [editingTeamId, setEditingTeamId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('team')
  )

  function goToTab(next: Tab) {
    setTab(next)
  }

  // Keeps a saved team's editor URL-addressable and shareable, matching the
  // existing ?calc=/?dex=/?mon= pattern - a team card link now survives a
  // refresh or a bookmark instead of always landing back on the list.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (tab === 'teams' && editingTeamId) {
      url.searchParams.set('team', editingTeamId)
    } else {
      url.searchParams.delete('team')
    }
    window.history.replaceState(null, '', url)
  }, [tab, editingTeamId])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Pokemon Champions Companion</h1>
        <nav className="app-nav">
          <button className={tab === 'start' ? 'active' : ''} onClick={() => goToTab('start')}>
            Start Here
          </button>
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => goToTab('teams')}>
            Teams
          </button>
          <button className={tab === 'dex' ? 'active' : ''} onClick={() => goToTab('dex')}>
            Pokedex
          </button>
          <button className={tab === 'meta' ? 'active' : ''} onClick={() => goToTab('meta')}>
            Meta
          </button>
          <button className={tab === 'tournaments' ? 'active' : ''} onClick={() => goToTab('tournaments')}>
            Tournaments
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
      <div className={tab === 'start' ? 'app-page' : 'app-page hidden'}>
        <StartHerePage />
      </div>
      <div className={tab === 'teams' ? 'app-page' : 'app-page hidden'}>
        {editingTeamId ? (
          <TeamEditorPage teamId={editingTeamId} onBack={() => setEditingTeamId(null)} />
        ) : (
          <TeamsListPage onOpenTeam={setEditingTeamId} />
        )}
      </div>
      <div className={tab === 'dex' ? 'app-page' : 'app-page hidden'}>
        <DexPage active={tab === 'dex'} />
      </div>
      <div className={tab === 'meta' ? 'app-page' : 'app-page hidden'}>
        <MetaPage active={tab === 'meta'} />
      </div>
      <div className={tab === 'tournaments' ? 'app-page' : 'app-page hidden'}>
        <TournamentsPage />
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
