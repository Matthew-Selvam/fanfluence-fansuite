import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { BrandDeal } from '../../lib/api'
import { Plus } from 'lucide-react'

const btn = 'px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold'

export function Deals() {
  const [deals, setDeals] = useState<BrandDeal[]>([]); useEffect(() => { api.brandDeals.list().then(p => setDeals(p.items)).catch(() => {}) }, [])
  return <div className="space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Brand deals</h2><p className="text-xs text-[#7F7F99] mt-1">Move each partnership from brief to published with traceability.</p></div><button className={btn}><Plus className="w-4 h-4 inline mr-1" />New deal</button></div><div className="space-y-3">{deals.map(d => <div key={d.id} className="glass-strong rounded-2xl p-5 flex items-center justify-between"><div><div className="font-semibold">{d.brand}</div><div className="text-xs text-[#7F7F99] mt-1">{d.category || 'Partnership'} · ${(d.valueMinor / 100).toLocaleString()}</div></div><span className="px-3 py-1.5 rounded-full text-xs text-[#C9A96E] border border-[#C9A96E]/30">{d.stage}</span></div>)}{deals.length === 0 && <div className="py-16 text-center text-sm text-[#7F7F99]">No brand deals yet.</div>}</div></div>
}