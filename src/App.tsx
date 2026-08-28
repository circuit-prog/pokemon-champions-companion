import { useState } from 'react'
import TeamBuilder from './components/TeamBuilder'
import DamageCalculator from './components/DamageCalculator'
import './App.css'

type Tab = 'team' | 'calc'

function App() {
  const [tab, setTab] = useState<Tab>('team')

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Pokemon Champions Companion</h1>
        <nav className="app-nav">
          <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
            Team Builder
          </button>
          <button className={tab === 'calc' ? 'active' : ''} onClick={() => setTab('calc')}>
            Damage Calculator
          </button>
        </nav>
      </header>
      {tab === 'team' ? <TeamBuilder /> : <DamageCalculator />}
    </div>
  )
}

export default App
