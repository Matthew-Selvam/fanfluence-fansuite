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
  useEffect(() => { api.fans.list().then(p => { setFans(p.items); setLoading(false) }) }, [])
  const filtered = fans.filter(f => f.name?.toLowerCase().includes(search.toLowerCase()) || f.username?.toLowerCase().includes(search.toLowerCase()))
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-3xl font-black tracking-tight"><span className="text-gradient">Fans</span></h1><p className="text-[#7F7F99] mt-1 text-sm">{fans.length} fan{fans.length !== 1 ? 's' : ''} across all characters</p></div>
      <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold hover:scale-105 transition-transform"><Plus className="w-4 h-4" /> Add Fan</button>
    </div>
    <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7F7F99]" />
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fans by name or username..." className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0E0E14] border border-[#2A2A3A] text-sm text-[#E4E4E7] placeholder:text-[#7F7F99] focus:outline-none focus:border-[#C9A96E]/50" /></div>
    {loading ? <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-[#C9A96E]/20 border-t-[#C9A96E] animate-spin" /></div> : filtered.length === 0 ? <div className="text-center text-[#7F7F99] py-12">No fans yet</div> : <div className="bg-[#0E0E14] border border-[#2A2A3A] rounded-xl overflow-hidden">
      <table className="w-full text-sm"><thead><tr className="border-b border-[#2A2A3A] text-[#7F7F99]"><th className="text-left p-3 font-medium">Name</th><th className="text-left p-3 font-medium">Username</th><th className="text-left p-3 font-medium">Platform</th><th className="text-right p-3 font-medium">Messages</th><th className="text-right p-3 font-medium">Status</th></tr></thead>
      <tbody>{filtered.map(f => <tr key={f.id} className="border-b border-[#2A2A3A]/50 hover:bg-[#11111E]/50"><td className="p-3"><Link to={`/fans/${f.id}`} className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-xs font-bold">{f.name?.charAt(0) || '?'}</div><span className="font-medium">{f.name || 'Anonymous'}</span></Link></td><td className="p-3 text-[#7F7F99]">@{f.username}</td><td className="p-3 text-[#7F7F99]">{f.platform}</td><td className="p-3 text-right">{f.messageCount}</td><td className="p-3 text-right"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.subscriberState === 'active' ? 'bg-[#00FFAA]/10 text-[#00FFAA]' : 'bg-[#7F7F99]/10 text-[#7F7F99]'}`}>{f.subscriberState}</span></td></tr>)}</tbody></table>
    </div>}
  </motion.div>
}