import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Character } from '../lib/api'
import { UserCircle, Sparkles, TrendingUp, Eye } from 'lucide-react'

export function Dashboard() {
  const [chars, setChars] = useState<Character[]>([])
  const [, setLoading] = useState(true)

  useEffect(() => {
    api.characters.list().then(p => { setChars(p.items); setLoading(false) })
  }, [])

  const stats = [
    { label: 'Characters', value: chars.length, icon: UserCircle, color: 'text-[#C9A96E]' },
    { label: 'Active', value: chars.filter(c => c.status === 'active').length, icon: Sparkles, color: 'text-[#00FFAA]' },
    { label: 'Engagement', value: '—', icon: TrendingUp, color: 'text-blue-400' },
    { label: 'Views', value: '—', icon: Eye, color: 'text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-[#1A1A1F] border border-[#2E2E35] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#9F9FA6]">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#1A1A1F] border border-[#2E2E35] rounded-xl">
        <div className="p-4 border-b border-[#2E2E35] flex items-center justify-between">
          <h2 className="font-medium">Characters</h2>
          <Link to="/characters" className="text-sm text-[#C9A96E] hover:underline">View all</Link>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {chars.map(c => (
            <Link key={c.id} to={`/characters/${c.id}`}
              className="bg-[#25252B] border border-[#2E2E35] rounded-lg p-3 hover:border-[#C9A96E]/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-xs font-bold">
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-[#9F9FA6] truncate">{c.niche || '—'}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  c.status === 'active' ? 'bg-[#00FFAA]/10 text-[#00FFAA]' :
                  c.status === 'draft' ? 'bg-[#9F9FA6]/10 text-[#9F9FA6]' :
                  'bg-[#C9A96E]/10 text-[#C9A96E]'
                }`}>
                  {c.status}
                </span>
                <span className="text-[10px] text-[#9F9FA6]">{c.contentRating}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}