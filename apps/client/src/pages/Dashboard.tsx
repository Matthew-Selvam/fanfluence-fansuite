import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Character } from '../lib/api'
import { UserCircle, Sparkles, TrendingUp, Eye, Activity, ArrowUpRight, Plus } from 'lucide-react'
import { motion } from 'framer-motion'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } } as const
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } } as const

export function Dashboard() {
  const [chars, setChars] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.characters.list().then(p => { setChars(p.items); setLoading(false) })
  }, [])

  const stats = [
    { label: 'Characters', value: chars.length, icon: UserCircle, change: '+2 this week', color: 'from-[#C9A96E]/30 to-[#C9A96E]/10' },
    { label: 'Active', value: chars.filter(c => c.status === 'active').length, icon: Sparkles, change: '100% rate', color: 'from-[#00FFAA]/30 to-[#00FFAA]/10' },
    { label: 'Engagement', value: '—', icon: TrendingUp, change: 'coming soon', color: 'from-blue-500/30 to-blue-500/10' },
    { label: 'Total Fans', value: '—', icon: Eye, change: 'coming soon', color: 'from-purple-500/30 to-purple-500/10' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <motion.h1 variants={item} className="text-4xl font-black tracking-tight">
            <span className="text-gradient">Dashboard</span>
          </motion.h1>
          <motion.p variants={item} className="text-[#7F7F99] mt-1 text-sm">Welcome back to your fanfluence universe</motion.p>
        </div>
        <motion.div variants={item} className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0E0E14] bg-gradient-to-br from-[#C9A96E]/40 to-[#00FFAA]/40 flex items-center justify-center text-[10px] font-bold">M</div>)}
          </div>
          <span className="text-xs text-[#7F7F99]">3 active</span>
        </motion.div>
      </div>

      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="group relative rounded-2xl bg-[#0E0E14] border border-[#2A2A3A] p-5 overflow-hidden card-shine">
            <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-[#7F7F99] uppercase tracking-wider">{s.label}</span>
                <s.icon className="w-4 h-4 text-[#7F7F99] group-hover:text-[#C9A96E] transition-colors" />
              </div>
              <div className="text-3xl font-black text-[#E4E4E7] group-hover:text-gradient transition-all">{s.value}</div>
              <div className="flex items-center gap-1 mt-2">
                <ArrowUpRight className="w-3 h-3 text-[#00FFAA]" />
                <span className="text-[10px] text-[#7F7F99]">{s.change}</span>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div variants={item} className="aurora-bg rounded-2xl bg-[#0E0E14] border border-[#2A2A3A]">
        <div className="p-5 border-b border-[#2A2A3A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C9A96E]/20 to-[#00FFAA]/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-[#C9A96E]" />
            </div>
            <h2 className="font-semibold text-sm">Characters</h2>
          </div>
          <Link to="/characters" className="group flex items-center gap-1.5 text-xs font-medium text-[#7F7F99] hover:text-[#C9A96E] transition-colors">
            View all <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#C9A96E]/30 border-t-[#C9A96E] rounded-full animate-spin" />
          </div>
        ) : chars.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#1E1E2A] border border-[#2A2A3A] flex items-center justify-center mx-auto mb-4">
              <UserCircle className="w-8 h-8 text-[#7F7F99]" />
            </div>
            <p className="text-[#7F7F99] text-sm mb-4">No characters yet</p>
            <Link to="/characters" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-semibold hover:scale-105 transition-transform">
              <Plus className="w-4 h-4" /> Create your first character
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
            {chars.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                <Link to={`/characters/${c.id}`}
                  className="group block relative rounded-xl bg-[#16161F] border border-[#2A2A3A] p-4 overflow-hidden hover:border-[#C9A96E]/30 transition-all duration-300 hover:shadow-lg hover:shadow-[#C9A96E]/5"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#C9A96E]/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 group-hover:from-[#C9A96E]/10 transition-all duration-500" />
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-lg font-bold text-white shrink-0 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#C9A96E]/20 to-[#00FFAA]/20 group-hover:opacity-0 transition-opacity" />
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm group-hover:text-gradient transition-all">{c.name}</div>
                      <div className="text-xs text-[#7F7F99] mt-0.5 truncate">{c.niche || '—'}</div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                          c.status === 'active' ? 'border-[#00FFAA]/30 text-[#00FFAA] bg-[#00FFAA]/5' :
                          c.status === 'draft' ? 'border-[#7F7F99]/30 text-[#7F7F99] bg-[#7F7F99]/5' :
                          'border-[#C9A96E]/30 text-[#C9A96E] bg-[#C9A96E]/5'
                        }`}>{c.status}</span>
                        <span className="text-[10px] text-[#7F7F99] uppercase tracking-wider">{c.contentRating}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}