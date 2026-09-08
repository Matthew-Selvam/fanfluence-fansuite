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
        <p className="text-[#b9b3c2] mt-1 text-sm">Manage your account, workspace, and preferences</p>
      </div>

      <div className="flex gap-8">
        <div className="w-56 shrink-0 space-y-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-[#20275b] text-[#EAE0CF] border border-[#4B5694]'
                  : 'text-[#b9b3c2] hover:text-[#EAE0CF] hover:bg-[#1a2058]'
              }`}>
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-[#7288AE]' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-2xl">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-6">
                <h2 className="font-semibold text-lg">Profile</h2>
                <div className="flex items-center gap-5">
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7288AE]/40 to-[#EAE0CF]/40 flex items-center justify-center text-2xl font-bold text-white overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#7288AE]/30 to-[#EAE0CF]/30" />
                    MS
                    <button className="absolute bottom-0 inset-x-0 py-1 bg-black/50 text-[10px] font-medium text-[#EAE0CF]">Edit</button>
                  </div>
                  <div>
                    <div className="font-medium">Matthew Selvam</div>
                    <div className="text-sm text-[#b9b3c2]">selvammatthew@gmail.com</div>
                    <div className="text-xs text-[#8a8da0] mt-1">Joined September 2026</div>
                  </div>
                </div>
              </div>

              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h3 className="font-medium text-sm">Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#b9b3c2]">First Name</label>
                    <input defaultValue="Matthew" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors placeholder:text-[#8a8da0]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#b9b3c2]">Last Name</label>
                    <input defaultValue="Selvam" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors placeholder:text-[#8a8da0]" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-[#b9b3c2]">Email</label>
                    <input defaultValue="selvammatthew@gmail.com" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors placeholder:text-[#8a8da0]" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7288AE] to-[#4B5694] text-white text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-[#7288AE]/20">
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
                  <label className="text-xs font-medium text-[#b9b3c2]">Workspace Name</label>
                  <input defaultValue="default" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#b9b3c2]">Timezone</label>
                  <select defaultValue="UTC" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors">
                    <option>UTC</option>
                    <option>America/New_York</option>
                    <option>Asia/Kolkata</option>
                    <option>Europe/London</option>
                  </select>
                </div>
              </div>
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h3 className="font-medium text-sm text-[#7288AE]">Danger Zone</h3>
                <p className="text-xs text-[#b9b3c2]">Permanently delete this workspace and all its data.</p>
                <button className="px-4 py-2 rounded-xl border border-[#7288AE]/30 text-[#7288AE] text-sm font-medium hover:bg-[#7288AE]/10 transition-colors">Delete Workspace</button>
              </div>
            </motion.div>
          )}

          {activeTab === 'api-keys' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">API Keys</h2>
                  <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7288AE] to-[#4B5694] text-white text-xs font-bold">Generate Key</button>
                </div>
                <div className="space-y-3">
                  {['Production', 'Staging', 'Development'].map(env => (
                    <div key={env} className="flex items-center justify-between p-4 rounded-xl bg-[#20275b] border border-[#4B5694]">
                      <div>
                        <div className="text-sm font-medium">{env}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono text-[#b9b3c2]">
                            {showKey ? `ff_sk_${env.toLowerCase()}_a1b2c3d4e5f6` : 'ff_sk_••••••••••••••••'}
                          </code>
                          <button onClick={() => setShowKey(!showKey)} className="text-[#8a8da0] hover:text-[#b9b3c2] transition-colors">
                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <button onClick={copyKey} className="text-[#8a8da0] hover:text-[#7288AE] transition-colors">
                        {copied ? <Check className="w-4 h-4 text-[#EAE0CF]" /> : <Copy className="w-4 h-4" />}
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
                  <label className="text-xs font-medium text-[#b9b3c2]">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['Dark', 'Light', 'System'].map(theme => (
                      <button key={theme} className={`p-4 rounded-xl border text-sm font-medium transition-all ${theme === 'Dark' ? 'bg-[#20275b] border-[#7288AE]/50 text-[#7288AE]' : 'bg-[#1a2058] border-[#4B5694] text-[#b9b3c2] hover:text-[#EAE0CF]'}`}>
                        <div className="w-8 h-8 rounded-lg bg-[#111844] border border-[#4B5694] mb-2 mx-auto" />
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-medium text-[#b9b3c2]">Accent Color</label>
                  <div className="flex gap-3">
                    {['#7288AE', '#EAE0CF', '#4B5694', '#111844', '#b9b3c2'].map(color => (
                      <button key={color} className={`w-8 h-8 rounded-xl transition-all ${color === '#7288AE' ? 'ring-2 ring-white/30 scale-110' : ''}`} style={{ background: color }} />
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
                      <div className="text-xs text-[#b9b3c2]">{n.desc}</div>
                    </div>
                    <button className={`w-10 h-6 rounded-full transition-colors relative ${n.enabled ? 'bg-[#7288AE]' : 'bg-[#4B5694]'}`}>
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
                  <label className="text-xs font-medium text-[#b9b3c2]">Current Password</label>
                  <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#b9b3c2]">New Password</label>
                    <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#b9b3c2]">Confirm Password</label>
                    <input type="password" className="w-full px-3 py-2.5 rounded-xl bg-[#20275b] border border-[#4B5694] text-sm text-[#EAE0CF] focus:outline-none focus:border-[#7288AE]/50 transition-colors" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7288AE] to-[#4B5694] text-white text-sm font-bold hover:scale-105 transition-transform">Update Password</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-strong rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-lg">Billing</h2>
                <div className="p-4 rounded-xl bg-[#20275b] border border-[#4B5694]">
                  <div className="text-xs text-[#b9b3c2] uppercase tracking-wider mb-1">Current Plan</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-gradient">Hobby</span>
                      <span className="text-sm text-[#b9b3c2] ml-2">Free</span>
                    </div>
                    <span className="text-xs text-[#8a8da0]">3 characters, 100 fans</span>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7288AE] to-[#4B5694] text-white text-sm font-bold hover:scale-105 transition-transform">Upgrade Plan</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}