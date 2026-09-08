import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Fan } from '../lib/api'
import { Plus, Search } from 'lucide-react'
import { motion } from 'framer-motion'

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight"><span className="text-gradient">Fans</span></h1>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7288AE] to-[#4B5694] text-white text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-[#7288AE]/20">
          <Plus className="w-4 h-4" /> Add Fan
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b9b3c2]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fans..."
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#151b50] border border-[#4B5694] text-sm text-[#EAE0CF] placeholder:text-[#b9b3c2] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#7288AE]/30 border-t-[#7288AE] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[#b9b3c2] py-12">No fans yet</div>
      ) : (
        <div className="bg-[#151b50] border border-[#4B5694] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#4B5694] text-[#b9b3c2]">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Username</th>
                <th className="text-left p-3 font-medium">Platform</th>
                <th className="text-right p-3 font-medium">Messages</th>
                <th className="text-right p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className="border-b border-[#4B5694]/50 hover:bg-[#1a2058]/50">
                  <td className="p-3">
                    <Link to={`/fans/${f.id}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7288AE]/30 to-[#4B5694]/30 flex items-center justify-center text-xs font-bold">
                        {f.name?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium">{f.name || 'Anonymous'}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-[#b9b3c2]">@{f.username}</td>
                  <td className="p-3 text-[#b9b3c2]">{f.platform}</td>
                  <td className="p-3 text-right">{f.messageCount}</td>
                  <td className="p-3 text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      f.subscriberState === 'active' ? 'bg-[#EAE0CF]/10 text-[#EAE0CF]' : 'bg-[#b9b3c2]/10 text-[#b9b3c2]'
                    }`}>{f.subscriberState}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  )
}