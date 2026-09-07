import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Bell, Key, Globe, Shield, Palette, CreditCard, Save, Eye, EyeOff, Copy, Check } from 'lucide-react'

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'workspace', label: 'Workspace', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'billing', label: 'Billing', icon: CreditCard },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyKey = () => {
    navigator.clipboard.writeText('ff_sk_••••••••••••••••').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight"><span className="text-gradient">Settings</span></h1>
        <p className="text-[#7F7F99] mt-1 text-sm">Manage your account, workspace, and preferences</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar tabs */}
        <div className="w-56 shrink-0 space-y-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-[#1A1A2E] text-[#E4E4E7] border border-[#22223A]'
                  : 'text-[#7F7F99] hover:text-[#E4E4E7] hover:bg-[#11111E]'
              }`}>
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-[#C9A96E]' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-6">
                <h2 className="font-semibold text-lg">Profile</h2>
                <div className="flex items-center gap-5">
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#C9A96E]/40 to-[#00FFAA]/40 flex items-center justify-center text-2xl font-bold text-white overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#C9A96E]/30 to-[#00FFAA]/30" />
                    MS
                    <button className="absolute bottom-0 inset-x-0 py-1 bg-black/50 text-[10px] font-medium text-[#E4E4E7]">Edit</button>
                  </div>
                  <div>
                    <div className="font-medium">Matthew Selvam</div>
                    <div className="text-sm text-[#7F7F99]">selvammatthew@gmail.com</div>
                    <div className="text-xs text-[#555570] mt-1">Joined September 2026</div>
                  </div>
                </div>
              </div>

              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h3 className="font-medium text-sm">Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#7F7F99]">First Name</label>
                    <input defaultValue="Matthew" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors placeholder:text-[#555570]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#7F7F99]">Last Name</label>
                    <input defaultValue="Selvam" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors placeholder:text-[#555570]" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-[#7F7F99]">Email</label>
                    <input defaultValue="selvammatthew@gmail.com" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors placeholder:text-[#555570]" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-[#C9A96E]/20">
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'workspace' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Workspace</h2>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#7F7F99]">Workspace Name</label>
                  <input defaultValue="default" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#7F7F99]">Timezone</label>
                  <select defaultValue="UTC" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors">
                    <option>UTC</option>
                    <option>America/New_York</option>
                    <option>Asia/Kolkata</option>
                    <option>Europe/London</option>
                  </select>
                </div>
              </div>
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h3 className="font-medium text-sm text-red-400">Danger Zone</h3>
                <p className="text-xs text-[#7F7F99]">Permanently delete this workspace and all its data.</p>
                <button className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors">Delete Workspace</button>
              </div>
            </motion.div>
          )}

          {activeTab === 'api-keys' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">API Keys</h2>
                  <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-xs font-bold">Generate Key</button>
                </div>
                <div className="space-y-3">
                  {['Production', 'Staging', 'Development'].map(env => (
                    <div key={env} className="flex items-center justify-between p-4 rounded-xl bg-[#1A1A2E] border border-[#22223A]">
                      <div>
                        <div className="text-sm font-medium">{env}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono text-[#7F7F99]">
                            {showKey ? `ff_sk_${env.toLowerCase()}_a1b2c3d4e5f6` : 'ff_sk_••••••••••••••••'}
                          </code>
                          <button onClick={() => setShowKey(!showKey)} className="text-[#555570] hover:text-[#7F7F99] transition-colors">
                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <button onClick={copyKey} className="text-[#555570] hover:text-[#C9A96E] transition-colors">
                        {copied ? <Check className="w-4 h-4 text-[#00FFAA]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Appearance</h2>
                <div className="space-y-3">
                  <label className="text-xs font-medium text-[#7F7F99]">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['Dark', 'Light', 'System'].map(theme => (
                      <button key={theme} className={`p-4 rounded-xl border text-sm font-medium transition-all ${theme === 'Dark' ? 'bg-[#1A1A2E] border-[#C9A96E]/50 text-[#C9A96E]' : 'bg-[#11111E] border-[#22223A] text-[#7F7F99] hover:text-[#E4E4E7]'}`}>
                        <div className="w-8 h-8 rounded-lg bg-[#0A0A12] border border-[#22223A] mb-2 mx-auto" />
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-medium text-[#7F7F99]">Accent Color</label>
                  <div className="flex gap-3">
                    {['#C9A96E', '#00FFAA', '#6366F1', '#EC4899', '#F59E0B'].map(color => (
                      <button key={color} className={`w-8 h-8 rounded-xl transition-all ${color === '#C9A96E' ? 'ring-2 ring-white/30 scale-110' : ''}`} style={{ background: color }} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Notifications</h2>
                {[
                  { label: 'New fan messages', desc: 'When a fan sends a message to a character', enabled: true },
                  { label: 'Campaign results', desc: 'When a campaign completes or fails', enabled: true },
                  { label: 'Generation complete', desc: 'When AI generation finishes', enabled: false },
                  { label: 'Weekly digest', desc: 'Weekly summary of all activity', enabled: true },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{n.label}</div>
                      <div className="text-xs text-[#7F7F99]">{n.desc}</div>
                    </div>
                    <button className={`w-10 h-6 rounded-full transition-colors relative ${n.enabled ? 'bg-[#C9A96E]' : 'bg-[#2A2A3A]'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${n.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Security</h2>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#7F7F99]">Current Password</label>
                  <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#7F7F99]">New Password</label>
                    <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#7F7F99]">Confirm Password</label>
                    <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#1A1A2E] border border-[#22223A] text-sm text-[#E4E4E7] focus:outline-none focus:border-[#C9A96E]/50 transition-colors" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold hover:scale-105 transition-transform">Update Password</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Billing</h2>
                <div className="p-4 rounded-xl bg-[#1A1A2E] border border-[#22223A]">
                  <div className="text-xs text-[#7F7F99] uppercase tracking-wider mb-1">Current Plan</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-gradient">Hobby</span>
                      <span className="text-sm text-[#7F7F99] ml-2">Free</span>
                    </div>
                    <span className="text-xs text-[#555570]">3 characters, 100 fans</span>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A96E] to-[#B89450] text-black text-sm font-bold hover:scale-105 transition-transform">Upgrade Plan</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}