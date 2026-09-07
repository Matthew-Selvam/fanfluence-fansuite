import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Characters } from './pages/Characters'
import { Fans } from './pages/Fans'
import { SettingsPage } from './pages/Settings'
import { CharacterDetail, FanDetail, Studio, Campaigns, Providers } from './pages/Placeholders'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="characters" element={<Characters />} />
          <Route path="characters/:id" element={<CharacterDetail />} />
          <Route path="fans" element={<Fans />} />
          <Route path="fans/:id" element={<FanDetail />} />
          <Route path="studio" element={<Studio />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="providers" element={<Providers />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}