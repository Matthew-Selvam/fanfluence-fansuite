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

export interface Page<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface Character {
  id: string; name: string; displayName: string | null; username: string | null
  niche: string | null; status: string; contentRating: string
  backstory: string | null; personality: any; visual: any; brand: any
  createdAt: string; updatedAt: string
}

export interface Fan {
  id: string; name: string | null; username: string | null
  platform: string; externalId: string | null; locale: string | null
  interactionCount: number; messageCount: number; subscriberState: string
  tags: string[]
}

export interface Wardrobe { id: string; name: string; isDefault: boolean }
export interface Script { id: string; title: string; status: string; channel: string | null }
export interface BrandDeal { id: string; brand: string; stage: string; valueMinor: number }
export interface Campaign { id: string; name: string; objective: string; status: string }
export interface Provider { id: string; name: string; kind: string; health: string; adapter: string }

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
  media: {
    upload: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/media/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error?.message || 'Upload failed')
      return res.json()
    },
  },
}