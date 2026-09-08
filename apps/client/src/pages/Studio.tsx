import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Character } from '../lib/api'
import { Aperture, Clapperboard, FileText, Grid3X3, Image as ImageIcon, Layers3, Library, Plus, Shirt, Sparkles } from 'lucide-react'
import { Overview } from './studio/Overview'
import { PhotoStudio } from './studio/PhotoStudio'
import { ContentStudio } from './studio/ContentStudio'
import { WardrobePanel } from './studio/WardrobePanel'
import { Deals } from './studio/Deals'
import { Inspiration } from './studio/Inspiration'
import { Scripts as ScriptsTab } from './studio/Scripts'
import { Library as LibraryTab } from './studio/Library'
import { Health } from './studio/Health'

type Tab = 'overview' | 'photo' | 'content' | 'wardrobe' | 'deals' | 'inspiration' | 'scripts' | 'library' | 'health'
const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: Grid3X3 }, { id: 'photo', label: 'Photo Studio', icon: Aperture }, { id: 'content', label: 'Content Studio', icon: Clapperboard }, { id: 'wardrobe', label: 'Wardrobe', icon: Shirt }, { id: 'deals', label: 'Brand Deals', icon: Layers3 }, { id: 'inspiration', label: 'Inspiration', icon: ImageIcon }, { id: 'scripts', label: 'Scripts', icon: FileText }, { id: 'library', label: 'Library', icon: Library }, { id: 'health', label: 'Health', icon: Sparkles },
]

export function Studio() {
  const [tab, setTab] = useState<Tab>('overview'); const [characters, setCharacters] = useState<Character[]>([]); const [characterId, setCharacterId] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { api.characters.list().then(p => { setCharacters(p.items); setCharacterId(p.items[0]?.id || ''); setLoading(false) }).catch(() => setLoading(false)) }, [])
  const character = characters.find(c => c.id === characterId)
  return <div className="space-y-6"><header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-xs text-[#7F7F99] mb-2"><span className="w-1.5 h-1.5 rounded-full bg-[#00FFAA]" /> Studio / Operating workspace</div><h1 className="text-4xl font-black tracking-tight"><span className="text-gradient">Fanfluence Studio</span></h1><p className="text-[#7F7F99] mt-1 text-sm">Build characters, direct scenes, and ship content with control.</p></div><div className="flex items-center gap-2"><select value={characterId} onChange={e => setCharacterId(e.target.value)} className="appearance-none px-3 py-2.5 rounded-xl bg-[#11111E] border border-[#22223A] text-sm text-[#E4E4E7]">{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={() => setTab('photo')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold"><Plus className="w-4 h-4" /> Create</button></div></header><div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin border-b border-[#22223A]">{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-t-xl border-b-2 ${tab === t.id ? 'text-[#C9A96E] border-[#C9A96E] bg-[#C9A96E]/5' : 'text-[#7F7F99] border-transparent hover:text-[#E4E4E7]'}`}><t.icon className="w-3.5 h-3.5" />{t.label}</button>)}</div>{loading ? <Loading /> : tab === 'overview' ? <Overview character={character} onTab={setTab} /> : tab === 'photo' ? <PhotoStudio character={character} /> : tab === 'content' ? <ContentStudio character={character} /> : tab === 'wardrobe' ? <WardrobePanel characterId={characterId} /> : tab === 'deals' ? <Deals /> : tab === 'inspiration' ? <Inspiration /> : tab === 'scripts' ? <ScriptsTab /> : tab === 'library' ? <LibraryTab characterId={characterId} /> : <Health character={character} />}</div>
}
function Loading() { return <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-[#C9A96E]/20 border-t-[#C9A96E] animate-spin" /></div> }