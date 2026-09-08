import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Plus } from 'lucide-react'

export function WardrobePanel({ characterId }: { characterId?: string }) {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => {
    api.wardrobe.list(characterId).then(async ws => {
      if (ws[0]) setItems(await api.wardrobe.items(ws[0].id))
    }).catch(() => {})
  }, [characterId])
  return <div className="space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Wardrobe system</h2><p className="text-xs text-[#7F7F99] mt-1">Approved looks, locked continuity, and campaign assignments.</p></div><button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4 inline mr-1" />Add look</button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{items.map((i: any) => <div key={i.id} className="glass-strong rounded-2xl p-4"><div className="aspect-square rounded-xl bg-gradient-to-br from-[#C9A96E]/20 to-[#1A1A2E] flex items-center justify-center text-4xl">👗</div><div className="mt-3 text-sm font-medium">{i.name}</div><div className="text-[10px] text-[#7F7F99] mt-1">{i.category} · {i.style || 'custom'}</div></div>)}{items.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[#7F7F99]">No wardrobe items yet.</div>}</div></div>
}