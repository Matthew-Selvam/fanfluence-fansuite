import { motion } from 'framer-motion'
import { Cable, Construction } from 'lucide-react'

export function CharacterDetail() {
  return <div className="text-[#b9b3c2] py-12">Character detail — coming soon</div>
}
export function FanDetail() {
  return <div className="text-[#b9b3c2] py-12">Fan detail — coming soon</div>
}
export function Studio() {
  return <div className="text-[#b9b3c2] py-12">Studio — coming soon</div>
}
export function Campaigns() {
  return <div className="text-[#b9b3c2] py-12">Campaigns — coming soon</div>
}
export function Providers() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-center py-32"
    >
      <div className="glass-strong rounded-2xl p-10 text-center max-w-sm">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-[#1a2058] border border-[#4B5694] items-center justify-center mb-5">
          <Cable className="w-8 h-8 text-[#7288AE]" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          <span className="text-gradient">Providers</span>
        </h2>
        <p className="text-[#b9b3c2] text-sm mb-6">Connect external AI and publishing services. Configuration panels are being built.</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#20275b] border border-[#4B5694] text-xs text-[#b9b3c2]">
          <Construction className="w-3.5 h-3.5" />
          Coming soon
        </div>
      </div>
    </motion.div>
  )
}