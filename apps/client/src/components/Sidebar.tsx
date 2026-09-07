import { NavLink } from 'react-router-dom'
import { Users, UserCircle, Palette, Send, Cpu, Settings } from 'lucide-react'

const navItems = [
  { to: '/characters', label: 'Characters', icon: UserCircle },
  { to: '/fans', label: 'Fans', icon: Users },
  { to: '/studio', label: 'Studio', icon: Palette },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/providers', label: 'Providers', icon: Cpu },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-[#0F0F12] border-r border-[#2E2E35] flex flex-col">
      <div className="p-5 border-b border-[#2E2E35]">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-[#C9A96E]">Fanfluence</span>
          <span className="text-[#00FFAA] ml-1">Fansuite</span>
        </h1>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[#C9A96E]/10 text-[#C9A96E] font-medium'
                  : 'text-[#9F9FA6] hover:text-[#E4E4E7] hover:bg-[#1A1A1F]'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-[#2E2E35]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#C9A96E]/20 flex items-center justify-center text-[#C9A96E] text-xs font-medium">
            MS
          </div>
          <div className="text-xs">
            <div className="text-[#E4E4E7] font-medium">dev</div>
            <div className="text-[#9F9FA6]">default workspace</div>
          </div>
        </div>
      </div>
    </aside>
  )
}