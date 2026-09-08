import { NavLink } from 'react-router-dom'
import { Users, UserCircle, Palette, Send, Cpu, Settings, LayoutDashboard, Sparkles, ChevronLeft, Menu, X, Search } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/characters', label: 'Characters', icon: UserCircle, badge: '2' },
  { to: '/fans', label: 'Fans', icon: Users, badge: '3' },
  { to: '/studio', label: 'Studio', icon: Palette },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/providers', label: 'Providers', icon: Cpu },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true) }
      if (e.key === 'Escape') { setCmdOpen(false); setCmdQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { if (cmdOpen && inputRef.current) inputRef.current.focus() }, [cmdOpen])

  const filtered = cmdQuery ? navItems.filter(n => n.label.toLowerCase().includes(cmdQuery.toLowerCase())) : navItems

  return (
    <>
      <AnimatePresence>
        {cmdOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm" onClick={() => { setCmdOpen(false); setCmdQuery('') }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -20 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-lg glass-strong rounded-2xl shadow-2xl shadow-black/50 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#4B5694]">
                <Search className="w-4 h-4 text-[#b9b3c2]" />
                <input ref={inputRef} value={cmdQuery} onChange={e => setCmdQuery(e.target.value)} placeholder="Search pages..." className="flex-1 bg-transparent text-sm text-[#EAE0CF] placeholder:text-[#8a8da0] focus:outline-none" />
                <kbd className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-[#20275b] border border-[#4B5694] text-[#b9b3c2] font-mono">ESC</kbd>
              </div>
              <div className="p-2 max-h-64 overflow-y-auto">
                {filtered.map(n => (
                  <NavLink key={n.to} to={n.to} end={n.end} onClick={() => { setCmdOpen(false); setCmdQuery('') }}
                    className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${isActive ? 'bg-[#7288AE]/10 text-[#7288AE]' : 'text-[#b9b3c2] hover:text-[#EAE0CF] hover:bg-[#20275b]'}`}>
                    <n.icon className="w-4 h-4" />
                    <span>{n.label}</span>
                    <span className="ml-auto text-[10px] text-[#8a8da0] font-mono">⌘{n.label.charAt(0)}</span>
                  </NavLink>
                ))}
                {filtered.length === 0 && <p className="text-center text-[#b9b3c2] text-sm py-6">No results</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <button onClick={() => setMobileOpen(true)} className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-xl glass flex items-center justify-center">
        <Menu className="w-4 h-4 text-[#EAE0CF]" />
      </button>

      <AnimatePresence>
        {mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}
      </AnimatePresence>

      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:sticky top-0 z-30 h-screen transition-all duration-300 flex flex-col ${collapsed ? 'w-20' : 'w-64'} bg-[#111844]/90 backdrop-blur-2xl border-r border-[#4B5694]`}>
        <div className="flex items-center justify-between p-5 border-b border-[#4B5694]">
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7288AE] to-[#EAE0CF] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-black" />
              </div>
              <span className="text-base font-bold tracking-tight text-gradient">fanfluence</span>
            </motion.div>
          )}
          {collapsed && <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7288AE] to-[#EAE0CF] flex items-center justify-center mx-auto"><Sparkles className="w-4 h-4 text-black" /></div>}
          <button onClick={() => { setCollapsed(!collapsed); setMobileOpen(false) }} className="w-7 h-7 rounded-lg bg-[#20275b] border border-[#4B5694] flex items-center justify-center hover:bg-[#4B5694]/30 transition-colors hidden md:flex">
            <ChevronLeft className={`w-3.5 h-3.5 text-[#b9b3c2] transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => setMobileOpen(false)} className="md:hidden w-7 h-7 rounded-lg bg-[#20275b] border border-[#4B5694] flex items-center justify-center"><X className="w-3.5 h-3.5 text-[#b9b3c2]" /></button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          <div className="px-3 pb-2 hidden md:block">
            <button onClick={() => setCmdOpen(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#20275b] border border-[#4B5694] text-xs text-[#8a8da0] hover:text-[#b9b3c2] transition-colors cursor-pointer">
              <Search className="w-3 h-3" />
              <span>Search</span>
              <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#1a2058] border border-[#4B5694] font-mono">⌘K</kbd>
            </button>
          </div>

          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-[#EAE0CF] bg-[#20275b] border border-[#4B5694] shadow-lg'
                    : 'text-[#b9b3c2] hover:text-[#EAE0CF] hover:bg-[#1a2058]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && <motion.div layoutId="nav-pill" className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-gradient-to-b from-[#7288AE] to-[#EAE0CF]" />}
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#7288AE]' : ''}`} />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7288AE]/10 text-[#7288AE] border border-[#7288AE]/20 font-medium">{item.badge}</span>}
                  {isActive && !collapsed && <span className="w-1.5 h-1.5 rounded-full bg-[#7288AE] animate-pulse-glow" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#4B5694]">
          <div className={`flex ${collapsed ? 'justify-center' : 'items-center gap-3'} group cursor-pointer`}>
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#7288AE]/40 to-[#EAE0CF]/40 flex items-center justify-center text-sm font-bold text-white overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-[#7288AE]/30 to-[#EAE0CF]/30 group-hover:opacity-0 transition-opacity" />
              MS
            </div>
            {!collapsed && (
              <div className="text-xs min-w-0 flex-1">
                <div className="text-[#EAE0CF] font-medium truncate">Matthew</div>
                <div className="text-[#b9b3c2] truncate flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EAE0CF] animate-pulse-glow" />
                  default workspace
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}