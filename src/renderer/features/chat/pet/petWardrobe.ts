export const PET_UNLOCK_CHAR_STEP = 4000

export const PET_WARDROBE_ITEMS = [
  {
    id: 'pet-phrolova',
    type: 'skin',
    name: '灰蓝小法师',
    rarity: 'petdex',
    slug: 'phrolova',
    spriteClass: 'pet-skin-phrolova',
    previewClass: 'pet-preview-phrolova',
    glow: 'rgba(180, 224, 226, 0.46)'
  },
  {
    id: 'pet-qgirl',
    type: 'skin',
    name: '可爱女孩',
    rarity: 'petdex',
    slug: 'qgirl',
    spriteClass: 'pet-skin-qgirl',
    previewClass: 'pet-preview-qgirl',
    glow: 'rgba(255, 180, 208, 0.42)'
  },
  {
    id: 'pet-tenshi',
    type: 'skin',
    name: '天使界隈',
    rarity: 'petdex',
    slug: 'tenshi-kaiwai-2',
    spriteClass: 'pet-skin-tenshi',
    previewClass: 'pet-preview-tenshi',
    glow: 'rgba(206, 222, 255, 0.42)'
  },
  {
    id: 'pet-byte-bunny',
    type: 'skin',
    name: 'Byte Bunny',
    rarity: 'petdex',
    slug: 'byte-bunny',
    spriteClass: 'pet-skin-byte-bunny',
    previewClass: 'pet-preview-byte-bunny',
    glow: 'rgba(196, 244, 255, 0.38)'
  },
  {
    id: 'pet-nene',
    type: 'skin',
    name: 'Nene',
    rarity: 'petdex',
    slug: 'nene',
    spriteClass: 'pet-skin-nene',
    previewClass: 'pet-preview-nene',
    glow: 'rgba(255, 218, 188, 0.42)'
  },
  {
    id: 'pet-usagi',
    type: 'skin',
    name: 'Usagi',
    rarity: 'petdex',
    slug: 'usagi',
    spriteClass: 'pet-skin-usagi',
    previewClass: 'pet-preview-usagi',
    glow: 'rgba(255, 234, 174, 0.42)'
  },
  {
    id: 'pet-mochi',
    type: 'skin',
    name: 'Mochi',
    rarity: 'petdex',
    slug: 'mochi',
    spriteClass: 'pet-skin-mochi',
    previewClass: 'pet-preview-mochi',
    glow: 'rgba(214, 245, 214, 0.4)'
  },
  {
    id: 'pet-aka-shiba',
    type: 'skin',
    name: '柴柴',
    rarity: 'petdex',
    slug: 'aka-shiba',
    spriteClass: 'pet-skin-aka-shiba',
    previewClass: 'pet-preview-aka-shiba',
    glow: 'rgba(255, 221, 170, 0.42)'
  },
  {
    id: 'pet-xiaobai',
    type: 'skin',
    name: '小白',
    rarity: 'petdex',
    slug: 'xiaobai',
    spriteClass: 'pet-skin-xiaobai',
    previewClass: 'pet-preview-xiaobai',
    glow: 'rgba(230, 238, 255, 0.38)'
  },
  {
    id: 'pet-feibi',
    type: 'skin',
    name: 'Feibi',
    rarity: 'petdex',
    slug: 'feibi',
    spriteClass: 'pet-skin-feibi',
    previewClass: 'pet-preview-feibi',
    glow: 'rgba(196, 255, 229, 0.38)'
  },
  {
    id: 'pet-baoer',
    type: 'skin',
    name: 'Baoer',
    rarity: 'petdex',
    slug: 'baoer',
    spriteClass: 'pet-skin-baoer',
    previewClass: 'pet-preview-baoer',
    glow: 'rgba(255, 196, 196, 0.4)'
  },
  {
    id: 'pet-golden-retriever',
    type: 'skin',
    name: '金毛',
    rarity: 'petdex',
    slug: 'golden-retriever',
    spriteClass: 'pet-skin-golden-retriever',
    previewClass: 'pet-preview-golden-retriever',
    glow: 'rgba(255, 218, 142, 0.42)'
  }
]

export const PET_ASSET_SPECS = []

export function getWardrobeItem(itemId) {
  return PET_WARDROBE_ITEMS.find((item) => item.id === itemId)
}

export function getNextUnlockableItem(profile) {
  const unlocked = new Set(profile.unlockedItemIds || [])
  const deleted = new Set(profile.deletedItemIds || [])
  return PET_WARDROBE_ITEMS.find((item) => !unlocked.has(item.id) && !deleted.has(item.id))
}
