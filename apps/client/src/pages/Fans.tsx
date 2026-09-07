import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Fan } from '../lib/api'
import { Plus, Search } from 'lucide-react'

export function Fans() {
  const [fans, setFans] = useState<Fan[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.fans.list().then(p => { setFans(p.items); setLoading(false) })
  }, [])

  const filtered = fans.filter(f =>
    f.name?.toLowerCase().includes(search.toLowerCase()) ||
    f.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fans</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#C9A96E] text-black text-sm font-medium rounded-lg hover:bg-[#B89450] transition-colors">
          <Plus className="w-4 h-4" /> Add Fan
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9F9FA6]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fans..."
          className="w-full pl-10 pr-4 py-2.5 bg-[#1A1A1F] border border-[#2E2E35] rounded-lg text-sm text-[#E4E4E7] placeholder:text-[#9F9FA6] focus:outline-none focus:border-[#C9A96E]/50" />
      </div>
      {loading ? (
        <div className="text-center text-[#9F9FA6] py-12">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[#9F9FA6] py-12">No fans yet</div>
      ) : (
        <div className="bg-[#1A1A1F] border border-[#2E2E35] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2E2E35] text-[#9F9FA6]">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Username</th>
                <th className="text-left p-3 font-medium">Platform</th>
                <th className="text-right p-3 font-medium">Messages</th>
                <th className="text-right p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className="border-b border-[#2E2E35]/50 hover:bg-[#25252B]/50">
                  <td className="p-3">
                    <Link to={`/fans/${f.id}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-xs font-bold">
                        {f.name?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium">{f.name || 'Anonymous'}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-[#9F9FA6]">@{f.username}</td>
                  <td className="p-3 text-[#9F9FA6]">{f.platform}</td>
                  <td className="p-3 text-right">{f.messageCount}</td>
                  <td className="p-3 text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      f.subscriberState === 'active' ? 'bg-[#00FFAA]/10 text-[#00FFAA]' : 'bg-[#9F9FA6]/10 text-[#9F9FA6]'
                    }`}>{f.subscriberState}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}