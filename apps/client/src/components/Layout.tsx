import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { motion } from 'framer-motion'

export function Layout() {
  return (
    <div className="flex min-h-screen bg-[#111844]">
      <Sidebar />
      <main className="flex-1 overflow-auto relative">
        <div className="ambient-grid absolute inset-0 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 p-6 md:p-8 lg:p-10 max-w-[1400px] mx-auto"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}