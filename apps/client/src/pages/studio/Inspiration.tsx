import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { InspirationBoard } from '../../lib/api'
import { Plus } from 'lucide-react'

export function Inspiration() {
  const [boards, setBoards] = useState<InspirationBoard[]>([]); useEffect(() => { api.inspiration.boards().then(setBoards).catch(() => {}) }, [])
  return <div className="space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Inspiration boards</h2><p className="text-xs text-[#7F7F99] mt-1">Reference collections, palette direction, and creative intent.</p></div><button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4 inline mr-1" />Create board</button></div><div className="grid md:grid-cols-3 gap-4">{boards.map(b => <div key={b.id} className="glass-strong rounded-2xl p-5 min-h-36"><div className="grid grid-cols-3 gap-1 h-16 mb-4"><div className="rounded bg-[#C9A96E]/30" /><div className="rounded bg-[#22223A]" /><div className="rounded bg-[#00FFAA]/20" /></div><div className="font-semibold text-sm">{b.name}</div><div className="text-xs text-[#7F7F99] mt-1">{b.description || 'No description'}</div></div>)}{boards.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[#7F7F99]">Create a board for references, products, and visual language.</div>}</div></div>
}