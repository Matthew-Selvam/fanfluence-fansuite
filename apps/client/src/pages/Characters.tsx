import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, ArrowUpRight } from 'lucide-react'
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
          <p className="text-[#b9b3c2] mt-1 text-sm">{chars.length} character{chars.length !== 1 ? 's' : ''} in your universe</p>
        </motion.div>
      </div>

      <motion.div variants={item} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b9b3c2]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search characters by name or niche..."
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#151b50] border border-[#4B5694] text-sm text-[#EAE0CF] placeholder:text-[#b9b3c2] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#7288AE]/30 border-t-[#7288AE] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div variants={item} className="text-center py-20">
          <div className="w-20 h-20 rounded-3xl bg-[#1a2058] border border-[#4B5694] flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-10 h-10 text-[#b9b3c2]" />
          </div>
          <p className="text-[#b9b3c2] text-sm mb-4">{search ? 'No characters match your search' : 'No characters yet'}</p>
        </motion.div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <Link to={`/characters/${c.id}`}
                className="group block relative rounded-2xl bg-[#151b50] border border-[#4B5694] p-5 overflow-hidden hover:border-[#7288AE]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#7288AE]/5 card-shine"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#7288AE]/8 to-transparent rounded-full translate-x-1/3 -translate-y-1/3 group-hover:from-[#7288AE]/15 transition-all duration-500" />
                <div className="relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7288AE]/30 to-[#EAE0CF]/30 flex items-center justify-center text-xl font-bold text-white shrink-0 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#7288AE]/20 to-[#EAE0CF]/20 group-hover:opacity-0 transition-opacity" />
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold group-hover:text-gradient transition-all">{c.name}</div>
                      <div className="text-xs text-[#b9b3c2] mt-0.5 truncate">{c.niche || '—'}</div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium border ${
                          c.status === 'active' ? 'border-[#EAE0CF]/30 text-[#EAE0CF] bg-[#EAE0CF]/5' :
                          c.status === 'draft' ? 'border-[#b9b3c2]/30 text-[#b9b3c2] bg-[#b9b3c2]/5' :
                          'border-[#7288AE]/30 text-[#7288AE] bg-[#7288AE]/5'
                        }`}>{c.status}</span>
                        <span className="text-[10px] text-[#b9b3c2] uppercase tracking-wider">{c.contentRating}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#b9b3c2] group-hover:text-[#7288AE] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
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