import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Campaign } from '../lib/api'
import { Send, Plus, Calendar } from 'lucide-react'

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  useEffect(() => { api.brandDeals.list().then(p => setCampaigns(p.items.map(d => ({ id: d.id, name: d.brand + ' Campaign', objective: 'promotion' as const, status: d.stage })))).catch(() => {}) }, [])
  return <div className="space-y-6"><div className="flex justify-between"><div><h1 className="text-4xl font-black tracking-tight"><span className="text-gradient">Campaigns</span></h1><p className="text-[#7F7F99] mt-1 text-sm">Scheduled outreach, A/B variants, and quiet-hour delivery.</p></div><button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4" /> New Campaign</button></div><div className="grid md:grid-cols-2 gap-4">{campaigns.map(c => <div key={c.id} className="glass-strong rounded-2xl p-5"><div className="flex justify-between"><Send className="w-5 h-5 text-[#C9A96E]" /><span className="text-[10px] px-2 py-1 rounded-full border border-[#22223A] text-[#7F7F99]">{c.status}</span></div><div className="mt-4 font-semibold">{c.name}</div><div className="text-xs text-[#7F7F99] mt-1">{c.objective}</div><div className="mt-4 flex items-center gap-2 text-[10px] text-[#7F7F99]"><Calendar className="w-3 h-3" />Draft — not scheduled</div></div>)}{campaigns.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[#7F7F99]">No campaigns yet.</div>}</div></div>
}