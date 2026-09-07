import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import type { Character } from '../lib/api'

export function Characters() {
  const [chars, setChars] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.characters.list().then(p => { setChars(p.items); setLoading(false) })
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#C9A96E] text-black text-sm font-medium rounded-lg hover:bg-[#B89450] transition-colors">
          <Plus className="w-4 h-4" /> New Character
        </button>
      </div>
      {loading ? (
        <div className="text-center text-[#9F9FA6] py-12">Loading...</div>
      ) : chars.length === 0 ? (
        <div className="text-center text-[#9F9FA6] py-12">No characters yet</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {chars.map(c => (
            <Link key={c.id} to={`/characters/${c.id}`}
              className="bg-[#1A1A1F] border border-[#2E2E35] rounded-xl p-4 hover:border-[#C9A96E]/50 transition-colors group">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-lg font-bold shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium group-hover:text-[#C9A96E] transition-colors">{c.name}</div>
                  <div className="text-sm text-[#9F9FA6] mt-0.5">{c.niche || '—'}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      c.status === 'active' ? 'bg-[#00FFAA]/10 text-[#00FFAA]' :
                      c.status === 'draft' ? 'bg-[#9F9FA6]/10 text-[#9F9FA6]' :
                      'bg-[#C9A96E]/10 text-[#C9A96E]'
                    }`}>{c.status}</span>
                    <span className="text-[10px] text-[#9F9FA6] uppercase">{c.contentRating}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}