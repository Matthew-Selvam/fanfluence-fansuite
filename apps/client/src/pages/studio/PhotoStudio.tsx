import { useState } from 'react'
import type { Character } from '../../lib/api'
import { WandSparkles, Sparkles } from 'lucide-react'

const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-[#11111E] border border-[#22223A] text-sm text-[#E4E4E7] placeholder:text-[#555570] focus:outline-none focus:border-[#C9A96E]/50'

export function PhotoStudio({ character }: { character?: Character }) {
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('Editorial portrait, natural light, refined fashion styling')
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="min-h-[520px] rounded-2xl border border-[#22223A] bg-[#0A0A12] flex items-center justify-center relative overflow-hidden ambient-grid">
        <div className="absolute inset-0 bg-gradient-to-br from-[#C9A96E]/10 via-transparent to-[#00FFAA]/5" />
        <div className="relative text-center">
          <div className="w-36 h-36 rounded-[2.5rem] bg-gradient-to-br from-[#C9A96E]/35 to-[#00FFAA]/25 flex items-center justify-center text-6xl font-black mx-auto animate-levitate">{character?.name?.charAt(0) || '?'}</div>
          <div className="mt-6 text-sm font-medium">Photo canvas ready</div>
          <div className="text-xs text-[#7F7F99] mt-1">{character?.name || 'Choose a character'} / 9:16 / draft</div>
        </div>
      </div>
      <div className="glass-strong rounded-2xl p-5 space-y-5">
        <div><div className="flex items-center gap-2 text-sm font-semibold"><WandSparkles className="w-4 h-4 text-[#C9A96E]" /> Scene configuration</div><div className="text-xs text-[#7F7F99] mt-1">Provider-agnostic brief composition</div></div>
        <label className="block text-xs text-[#7F7F99]">Location<select className={inputClass + ' mt-2'}><option>Studio</option><option>Living room</option><option>Street</option><option>Beach</option><option>Custom</option></select></label>
        <label className="block text-xs text-[#7F7F99]">Time<select className={inputClass + ' mt-2'}><option>Golden hour</option><option>Morning</option><option>Night</option></select></label>
        <label className="block text-xs text-[#7F7F99]">Direction<textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} className={inputClass + ' mt-2 resize-none'} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#7F7F99]">Aspect<select className={inputClass + ' mt-2'}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
          <label className="text-xs text-[#7F7F99]">Variants<select className={inputClass + ' mt-2'}><option>4</option><option>2</option><option>1</option></select></label>
        </div>
        <button onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1200) }} className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold">{busy ? 'Preparing brief...' : <><Sparkles className="w-4 h-4" /> Compose generation brief</>}</button>
      </div>
    </div>
  )
}