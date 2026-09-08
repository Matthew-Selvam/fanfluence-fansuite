import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { MediaAsset } from '../../lib/api'
import { Image as ImageIcon, Plus } from 'lucide-react'

export function Library({ characterId }: { characterId?: string }) {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  useEffect(() => { api.media.list(characterId ? `characterId=${characterId}` : '').then(p => setAssets(p.items)).catch(() => {}) }, [characterId])
  return <div className="space-y-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Media library</h2><p className="text-xs text-[#7F7F99] mt-1">Every asset, reference, output, and version in one place.</p></div><label className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold cursor-pointer"><Plus className="w-4 h-4 inline mr-1" />Upload<input type="file" className="hidden" /></label></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{assets.map(a => <div key={a.id} className="glass-strong rounded-2xl overflow-hidden"><div className="aspect-square bg-[#11111E] flex items-center justify-center"><ImageIcon className="w-8 h-8 text-[#555570]" /></div><div className="p-3"><div className="text-xs font-medium truncate">{a.filename}</div><div className="text-[10px] text-[#7F7F99] mt-1">{a.kind} · {Math.round(a.sizeBytes / 1024)} KB</div></div></div>)}{assets.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[#7F7F99]">Upload your first asset to start building the library.</div>}</div></div>
}