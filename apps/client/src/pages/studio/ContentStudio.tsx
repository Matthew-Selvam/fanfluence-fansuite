import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Character, ContentProject } from '../../lib/api'
import { Plus, Clapperboard } from 'lucide-react'

const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-[#11111E] border border-[#22223A] text-sm text-[#E4E4E7] placeholder:text-[#555570] focus:outline-none focus:border-[#C9A96E]/50'

export function ContentStudio({ character }: { character?: Character }) {
  const [projects, setProjects] = useState<ContentProject[]>([]); const [title, setTitle] = useState('')
  useEffect(() => { api.projects.list(character?.id).then(setProjects).catch(() => {}) }, [character?.id])
  const create = async () => { if (!title) return; try { const p: ContentProject = await api.projects.create({ title, characterId: character?.id }); setProjects(x => [p, ...x]); setTitle('') } catch {} }
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Content projects</h2><p className="text-xs text-[#7F7F99] mt-1">Ordered shot architecture for video concepts and outputs.</p></div><div className="flex gap-2"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="New project title" className={inputClass + ' w-48'} /><button onClick={create} className="px-4 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4 inline mr-1" />Create</button></div></div><div className="grid md:grid-cols-2 gap-4">{projects.map(p => <div key={p.id} className="glass-strong rounded-2xl p-5"><div className="flex justify-between"><div><div className="font-semibold">{p.title}</div><div className="text-xs text-[#7F7F99] mt-1">{p.aspect} · {p.status}</div></div><Clapperboard className="w-5 h-5 text-[#C9A96E]" /></div><div className="mt-6 h-2 rounded-full bg-[#1A1A2E]"><div className="h-full w-1/4 rounded-full bg-gradient-to-r from-[#C9A96E] to-[#00FFAA]" /></div><div className="mt-3 text-[10px] text-[#7F7F99]">1 scene · ready for shot planning</div></div>)}{projects.length === 0 && <div className="md:col-span-2 py-16 text-center text-sm text-[#7F7F99]">No projects yet. Create the first production board.</div>}</div></div>
}