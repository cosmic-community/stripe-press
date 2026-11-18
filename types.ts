export interface CosmicImage {
  url: string
  imgix_url: string
}

export interface CosmicObject {
  id: string
  slug: string
  title: string
  content?: string
  type: string
  metadata: Record<string, unknown>
  created_at?: string | null
  modified_at?: string | null
  published_at?: string | null
}

export interface Book extends CosmicObject {
  type: 'book'
  metadata: {
    seo_description?: string
    price?: number
    featured_image?: CosmicImage
    source_url?: string
    content?: string
  }
}

export interface Page extends CosmicObject {
  type: 'page'
  metadata: {
    seo_description?: string
    featured_image?: CosmicImage
    source_url?: string
    content?: string
  }
}