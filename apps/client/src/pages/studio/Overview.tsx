import type { Character } from '../../lib/api'
import { ArrowRight, Check } from 'lucide-react'

type Tab = 'overview' | 'photo' | 'content' | 'wardrobe' | 'deals' | 'inspiration' | 'scripts' | 'library' | 'health'

export function Overview({ character, onTab }: { character?: Character; onTab: (t: Tab) => void }) {
  const checks = [
    { label: 'Complete identity profile', ok: !!character?.backstory },
    { label: 'Add visual references', ok: !!character?.visual },
    { label: 'Build first wardrobe', ok: false },
    { label: 'Create character sheet', ok: false },
    { label: 'Draft first script', ok: false },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Profile', character?.backstory ? 'Ready' : 'Incomplete'], ['Visual identity', character?.visual ? 'Configured' : 'Missing'], ['Content pieces', '0'], ['Active jobs', '0']].map(([a, b]) => (
          <div key={a} className="glass-strong rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#7F7F99]">{a}</div>
            <div className={`mt-3 text-lg font-bold ${String(b) !== 'Missing' ? 'text-[#00FFAA]' : 'text-[#E4E4E7]'}`}>{b}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-5">
        <div className="glass-strong rounded-2xl p-6 aurora-bg">
          <div className="relative z-10 flex items-start gap-5">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#C9A96E]/40 to-[#00FFAA]/30 flex items-center justify-center text-4xl font-black text-white">{character?.name?.charAt(0) || '?'}</div>
            <div>
              <div className="text-2xl font-bold">{character?.name || 'Select a character'}</div>
              <div className="text-sm text-[#7F7F99] mt-1">{character?.niche || 'No niche defined'}</div>
              <div className="flex gap-2 mt-4">
                <span className="px-2.5 py-1 rounded-full text-[10px] border border-[#00FFAA]/30 text-[#00FFAA]">{character?.status || 'draft'}</span>
                <span className="px-2.5 py-1 rounded-full text-[10px] border border-[#C9A96E]/30 text-[#C9A96E]">{character?.contentRating || 'sfw'}</span>
              </div>
            </div>
          </div>
          <p className="relative z-10 mt-6 text-sm leading-7 text-[#9D9DB2]">{character?.backstory || 'Your character workspace is ready. Start with identity, references, and a creative brief.'}</p>
          <div className="relative z-10 flex flex-wrap gap-2 mt-5">
            {[['Photo Studio', 'photo'], ['Content Studio', 'content'], ['Library', 'library']].map(([label, id]) => (
              <button key={id} onClick={() => onTab(id as Tab)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-xs text-[#E4E4E7]"><ArrowRight className="w-3.5 h-3.5 text-[#C9A96E]" />{label}</button>
            ))}
          </div>
        </div>
        <div className="glass-strong rounded-2xl p-6">
          <div className="flex justify-between items-center gap-3">
            <div>
              <div className="text-sm font-semibold">Production checklist</div>
              <div className="text-xs text-[#7F7F99] mt-1">Deterministic, AI optional</div>
            </div>
            <span className="text-lg font-bold text-[#C9A96E] shrink-0">{checks.filter(x => x.ok).length}/{checks.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {checks.map(x => (
              <div key={x.label} className="flex items-center gap-3 text-xs">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${x.ok ? 'bg-[#00FFAA]/15 text-[#00FFAA]' : 'bg-[#1A1A2E] text-[#555570]'}`}>{x.ok ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}</span>
                <span className={x.ok ? 'text-[#9D9DB2]' : 'text-[#E4E4E7]'}>{x.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}