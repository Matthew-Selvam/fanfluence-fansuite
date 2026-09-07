const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(body.error?.message || body.error?.reason || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface Page<T> { items: T[]; nextCursor: string | null; hasMore: boolean }
export interface Character { id: string; name: string; displayName: string | null; username: string | null; niche: string | null; status: string; contentRating: string; backstory: string | null; personality: any; visual: any; brand: any; createdAt: string; updatedAt: string }
export interface Fan { id: string; name: string | null; username: string | null; platform: string; externalId: string | null; locale: string | null; interactionCount: number; messageCount: number; subscriberState: string; tags: string[] }
export interface Wardrobe { id: string; name: string; isDefault: boolean; characterId?: string | null }
export interface WardrobeItem { id: string; name: string; category: string; style?: string | null; favorite: boolean; locked: boolean }
export interface Script { id: string; title: string; status: string; channel: string | null; hook?: string | null; body?: string | null; cta?: string | null }
export interface BrandDeal { id: string; brand: string; stage: string; valueMinor: number; category?: string | null; approvalState?: string }
export interface InspirationBoard { id: string; name: string; description?: string | null; characterId?: string | null }
export interface ContentProject { id: string; title: string; status: string; aspect: string; characterId?: string | null }
export interface Brief { id: string; title: string; kind: string; status: string; characterId?: string | null; spec: any }
export interface MediaAsset { id: string; filename: string; mimeType: string; kind: string; storageKey: string; sizeBytes: number; width?: number | null; height?: number | null; characterId?: string | null; approvalState: string; favorite: boolean; tags?: string[] | null }

export const api = {
  characters: {
    list: (params?: string) => request<Page<Character>>(`/characters?${params || ''}`),
    get: (id: string) => request<Character>(`/characters/${id}`),
    create: (data: any) => request<Character>('/characters', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<Character>(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/characters/${id}`, { method: 'DELETE' }),
    todos: (id: string) => request<any>(`/characters/${id}/todos`),
  },
  fans: {
    list: (params?: string) => request<Page<Fan>>(`/fans?${params || ''}`),
    get: (id: string) => request<Fan>(`/fans/${id}`),
    create: (data: any) => request<Fan>('/fans', { method: 'POST', body: JSON.stringify(data) }),
  },
  wardrobe: {
    list: (characterId?: string) => request<Wardrobe[]>(`/wardrobes${characterId ? `?characterId=${characterId}` : ''}`),
    items: (id: string) => request<WardrobeItem[]>(`/wardrobes/${id}/items`),
    create: (data: any) => request<Wardrobe>('/wardrobes', { method: 'POST', body: JSON.stringify(data) }),
    addItem: (data: any) => request<WardrobeItem>('/wardrobes/items', { method: 'POST', body: JSON.stringify(data) }),
  },
  homes: {
    list: (characterId?: string) => request<any[]>(`/homes${characterId ? `?characterId=${characterId}` : ''}`),
    create: (data: any) => request('/homes', { method: 'POST', body: JSON.stringify(data) }),
  },
  brandDeals: {
    list: () => request<Page<BrandDeal>>('/brand-deals'),
    create: (data: any) => request('/brand-deals', { method: 'POST', body: JSON.stringify(data) }),
    setStage: (id: string, stage: string) => request(`/brand-deals/${id}/stage`, { method: 'POST', body: JSON.stringify({ stage }) }),
  },
  scripts: {
    list: () => request<Script[]>('/scripts'),
    create: (data: any) => request('/scripts', { method: 'POST', body: JSON.stringify(data) }),
  },
  inspiration: {
    boards: () => request<InspirationBoard[]>('/inspiration/boards'),
    createBoard: (data: any) => request('/inspiration/boards', { method: 'POST', body: JSON.stringify(data) }),
    items: (id: string) => request<any[]>(`/inspiration/boards/${id}/items`),
  },
  projects: {
    list: (characterId?: string) => request<ContentProject[]>(`/content-projects${characterId ? `?characterId=${characterId}` : ''}`),
    get: (id: string) => request<any>(`/content-projects/${id}`),
    create: (data: any) => request<ContentProject>('/content-projects', { method: 'POST', body: JSON.stringify(data) }),
    addShot: (id: string, data: any) => request(`/content-projects/${id}/shots`, { method: 'POST', body: JSON.stringify(data) }),
  },
  briefs: {
    list: (characterId?: string) => request<Page<Brief>>(`/studio/briefs${characterId ? `?characterId=${characterId}` : ''}`),
    create: (data: any) => request('/studio/briefs', { method: 'POST', body: JSON.stringify(data) }),
    compile: (id: string) => request<any>(`/studio/briefs/${id}/compile`),
    submit: (id: string, data?: any) => request(`/studio/briefs/${id}/submit`, { method: 'POST', body: JSON.stringify(data || {}) }),
  },
  media: {
    list: (params?: string) => request<Page<MediaAsset>>(`/media?${params || ''}`),
    upload: async (file: File) => { const form = new FormData(); form.append('file', file); const res = await fetch(`${API_BASE}/media/upload`, { method: 'POST', body: form }); if (!res.ok) throw new Error((await res.json()).error?.message || 'Upload failed'); return res.json() },
    fileUrl: (id: string) => `${API_BASE}/media/${id}/file`,
  },
}
