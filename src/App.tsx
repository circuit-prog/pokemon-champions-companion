import { useState } from 'react'
import TeamsListPage from './components/TeamsListPage'
import TeamEditorPage from './components/TeamEditorPage'
import DexPage from './components/DexPage'
import DamageCalculator from './components/DamageCalculator'
import TeamToolsPage from './components/TeamToolsPage'
import './App.css'

type Tab = 'teams' | 'dex' | 'calc' | 'tools'

function App() {
  const [tab, setTab] = useState<Tab>('teams')
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)

  function goToTab(next: Tab) {
    setEditingTeamId(null)
    setTab(next)
  }

  let content
  if (tab === 'teams' && editingTeamId) {
    content = <TeamEditorPage teamId={editingTeamId} onBack={() => setEditingTeamId(null)} />
  } else if (tab === 'teams') {
    content = <TeamsListPage onOpenTeam={setEditingTeamId} />
  } else if (tab === 'dex') {
    content = <DexPage />
  } else if (tab === 'tools') {
    content = <TeamToolsPage />
  } else {
    content = <DamageCalculator />
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
      {content}
    </div>
  )
}

export default App
