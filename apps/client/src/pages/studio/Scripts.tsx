import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Script } from '../../lib/api'
import { FileText, Plus } from 'lucide-react'

export function Scripts() {
  const [scripts, setScripts] = useState<Script[]>([]); useEffect(() => { api.scripts.list().then(setScripts).catch(() => {}) }, [])
  return <div className="space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Scripts</h2><p className="text-xs text-[#7F7F99] mt-1">Hooks, dialogue, captions, and publishing state.</p></div><button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4 inline mr-1" />Draft script</button></div><div className="grid md:grid-cols-2 gap-4">{scripts.map(s => <div key={s.id} className="glass-strong rounded-2xl p-5"><div className="flex justify-between"><FileText className="w-5 h-5 text-[#C9A96E]" /><span className="text-[10px] px-2 py-1 rounded-full border border-[#22223A] text-[#7F7F99]">{s.status}</span></div><div className="mt-5 font-semibold">{s.title}</div><div className="text-xs text-[#7F7F99] mt-1">{s.channel || 'unassigned'}</div><div className="mt-4 text-xs text-[#9D9DB2] line-clamp-2">{s.hook || 'No hook yet'}</div></div>)}{scripts.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[#7F7F99]">No scripts yet.</div>}</div></div>
}