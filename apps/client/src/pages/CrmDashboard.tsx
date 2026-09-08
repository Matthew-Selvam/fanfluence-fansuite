import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Fan } from '../lib/api'
import { MessageCircle, Users, Activity, TrendingUp, ArrowUpRight } from 'lucide-react'

export function CrmDashboard() {
  const [fans, setFans] = useState<Fan[]>([])
  useEffect(() => { api.fans.list().then(p => setFans(p.items)).catch(() => {}) }, [])

  const stats = [
    { label: 'Total Fans', value: fans.length, icon: Users, change: '-', color: 'from-[#C9A96E]/30 to-[#C9A96E]/10' },
    { label: 'Active', value: fans.filter(f => f.subscriberState === 'active').length, icon: Activity, change: 'current', color: 'from-[#00FFAA]/30 to-[#00FFAA]/10' },
    { label: 'Messages', value: fans.reduce((s, f) => s + f.messageCount, 0), icon: MessageCircle, change: 'total', color: 'from-blue-500/30 to-blue-500/10' },
    { label: 'Engagement', value: '—', icon: TrendingUp, change: 'required', color: 'from-purple-500/30 to-purple-500/10' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight"><span className="text-gradient">CRM</span></h1>
        <p className="text-[#7F7F99] mt-1 text-sm">Audience relationships, conversations, and lifecycle management.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="glass-strong rounded-2xl p-4 shine">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#7F7F99] uppercase tracking-wider">{s.label}</span>
              <s.icon className="w-4 h-4 text-[#7F7F99]" />
            </div>
            <div className="text-3xl font-black text-[#E4E4E7]">{s.value}</div>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3 h-3 text-[#00FFAA]" />
              <span className="text-[10px] text-[#7F7F99]">{s.change}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-strong rounded-2xl p-6">
          <h2 className="font-semibold text-sm mb-4">Recent fans</h2>
          {fans.length === 0 ? <p className="text-[#7F7F99] text-xs">No fans yet</p> : fans.slice(0, 5).map(f => (
            <div key={f.id} className="flex items-center justify-between py-3 border-b border-[#22223A]/50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30 flex items-center justify-center text-xs font-bold">{f.name?.charAt(0) || '?'}</div>
                <div><div className="text-sm font-medium">{f.name || 'Anonymous'}</div><div className="text-[10px] text-[#7F7F99]">@{f.username} · {f.platform}</div></div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.subscriberState === 'active' ? 'bg-[#00FFAA]/10 text-[#00FFAA]' : 'bg-[#7F7F99]/10 text-[#7F7F99]'}`}>{f.subscriberState}</span>
            </div>
          ))}
        </div>
        <div className="glass-strong rounded-2xl p-6">
          <h2 className="font-semibold text-sm mb-4">Activity</h2>
          <p className="text-[#7F7F99] text-xs">Fan interactions, segmentation, and automation events will appear here once the conversation engine is connected.</p>
        </div>
      </div>
    </div>
  )
}