import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, ArrowUpRight, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import type { Character } from '../lib/api'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } } as const
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } } as const

export function Characters() {
  const [chars, setChars] = useState<Character[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.characters.list().then(p => { setChars(p.items); setLoading(false) })
  }, [])

  const filtered = chars.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.niche?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <div className="flex items-center justify-between">
        <motion.div variants={item}>
          <h1 className="text-4xl font-black tracking-tight"><span className="text-gradient">Characters</span></h1>
          <p className="text-[#7F7F99] mt-1 text-sm">{chars.length} character{chars.length !== 1 ? 's' : ''} in your universe</p>
        </motion.div>
        <motion.button variants={item} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-[#C9A96E]/20">
          <Plus className="w-4 h-4" /> New Character
        </motion.button>
      </div>

      <motion.div variants={item} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7F7F99]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search characters by name or niche..."
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#0E0E14] border border-[#2A2A3A] text-sm text-[#E4E4E7] placeholder:text-[#7F7F99] focus:outline-none focus:border-[#C9A96E]/50 transition-colors" />
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#C9A96E]/30 border-t-[#C9A96E] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div variants={item} className="text-center py-20">
          <div className="w-20 h-20 rounded-3xl bg-[#16161F] border border-[#2A2A3A] flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-10 h-10 text-[#7F7F99]" />
          </div>
          <p className="text-[#7F7F99] text-sm mb-4">{search ? 'No characters match your search' : 'No characters yet'}</p>
        </motion.div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <Link to={`/characters/${c.id}`}
                className="group block relative rounded-2xl bg-[#0E0E14] border border-[#2A2A3A] p-5 overflow-hidden hover:border-[#C9A96E]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#C9A96E]/5 card-shine"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#C9A96E]/8 to-transparent rounded-full translate-x-1/3 -translate-y-1/3 group-hover:from-[#C9A96E]/15 transition-all duration-500" />
                <div className="relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-xl font-bold text-white shrink-0 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#C9A96E]/20 to-[#00FFAA]/20 group-hover:opacity-0 transition-opacity" />
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold group-hover:text-gradient transition-all">{c.name}</div>
                      <div className="text-xs text-[#7F7F99] mt-0.5 truncate">{c.niche || '—'}</div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${
                          c.status === 'active' ? 'border-[#00FFAA]/30 text-[#00FFAA] bg-[#00FFAA]/5' :
                          c.status === 'draft' ? 'border-[#7F7F99]/30 text-[#7F7F99] bg-[#7F7F99]/5' :
                          'border-[#C9A96E]/30 text-[#C9A96E] bg-[#C9A96E]/5'
                        }`}>{c.status}</span>
                        <span className="text-[10px] text-[#7F7F99] uppercase tracking-wider">{c.contentRating}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#7F7F99] group-hover:text-[#C9A96E] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}