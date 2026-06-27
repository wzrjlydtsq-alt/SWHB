import { describe, expect, it } from 'vitest'
import path from 'path'
import {
  migrateLegacyLocalCacheReferences,
  normalizeProjectData,
  toXingheLocalUrl,
  PROJECT_SCHEMA_VERSION
} from './projectDataRepair.js'

describe('project data repair', () => {
  it('normalizes old project data with required schema fields', () => {
    const project = normalizeProjectData('old-project', {
      name: 'Old Project',
      nodes: [{ id: 'n1' }]
    })

    expect(project.id).toBe('old-project')
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(project.cacheRoot).toBeNull()
    expect(project.nodeGroups).toEqual([])
    expect(project.connections).toEqual([])
    expect(project.history).toEqual([])
    expect(project.nodes).toHaveLength(1)
  })

  it('recovers nodes from legacy nodesMap objects', () => {
    const project = normalizeProjectData('legacy-map-project', {
      projectName: 'Legacy Map Project',
      nodesMap: {
        n1: { id: 'n1', type: 'gen-image' },
        n2: { id: 'n2', type: 'sticky-note' }
      },
      links: [{ id: 'c1', source: 'n1', target: 'n2' }]
    })

    expect(project.name).toBe('Legacy Map Project')
    expect(project.nodes.map((node) => node.id)).toEqual(['n1', 'n2'])
    expect(project.connections).toHaveLength(1)
  })

  it('recovers nodes and view from nested legacy canvas exports', () => {
    const project = normalizeProjectData('nested-legacy-project', {
      canvas: {
        nodes: [{ id: 'n1', type: 'gen-video' }],
        edges: [{ id: 'c1', from: 'n1', to: 'n2' }],
        view: { x: 12, y: 24, zoom: 0.8 }
      }
    })

    expect(project.nodes).toHaveLength(1)
    expect(project.connections).toHaveLength(1)
    expect(project.view).toEqual({ x: 12, y: 24, zoom: 0.8 })
  })

  it('copies legacy LocalCache references into project cache and rewrites links', () => {
    const legacyRoot = path.resolve('C:/Users/test/AppData/Roaming/app/LocalCache')
    const projectRoot = path.resolve('D:/Projects/cache/project-a')
    const source = path.join(legacyRoot, 'images', 'history_1.jpg')
    const copied = []
    const madeDirs = []

    const input = {
      nodes: [{ id: 'n1', data: { imageUrl: toXingheLocalUrl(source) } }],
      history: [{ id: 'h1', url: source }]
    }

    const result = migrateLegacyLocalCacheReferences(input, {
      projectCacheRoot: projectRoot,
      legacyRoots: [legacyRoot],
      existsSync: (filePath) => path.resolve(filePath) === path.resolve(source),
      mkdirSync: (dirPath) => madeDirs.push(dirPath),
      copyFileSync: (from, to) => copied.push({ from, to })
    })

    expect(result.changed).toBe(true)
    expect(result.copied).toBe(1)
    expect(result.rewritten).toBe(2)
    expect(result.errors).toEqual([])
    expect(copied).toHaveLength(1)
    expect(madeDirs.every((dir) => dir.startsWith(path.join(projectRoot, 'images')))).toBe(true)
    expect(result.data.nodes[0].data.imageUrl).toContain('xinghe://local/?path=')
    expect(decodeURIComponent(result.data.nodes[0].data.imageUrl)).toContain(projectRoot)
    expect(result.data.history[0].url).toContain('xinghe://local/?path=')
  })

  it('does not touch user source assets outside managed legacy cache roots', () => {
    const legacyRoot = path.resolve('C:/Users/test/AppData/Roaming/app/LocalCache')
    const userSource = path.resolve('D:/UserMaterials/shot.png')
    const input = {
      nodes: [{ id: 'n1', data: { imageUrl: userSource } }]
    }

    const result = migrateLegacyLocalCacheReferences(input, {
      projectCacheRoot: path.resolve('D:/Projects/cache/project-a'),
      legacyRoots: [legacyRoot],
      existsSync: () => true,
      mkdirSync: () => {
        throw new Error('should not mkdir')
      },
      copyFileSync: () => {
        throw new Error('should not copy')
      }
    })

    expect(result.changed).toBe(false)
    expect(result.copied).toBe(0)
    expect(result.rewritten).toBe(0)
    expect(result.data).toBe(input)
  })

  it('keeps missing legacy cache references unchanged and reports them', () => {
    const legacyRoot = path.resolve('C:/Users/test/AppData/Roaming/app/LocalCache')
    const missing = path.join(legacyRoot, 'videos', 'missing.mp4')
    const input = { history: [{ id: 'h1', url: toXingheLocalUrl(missing) }] }

    const result = migrateLegacyLocalCacheReferences(input, {
      projectCacheRoot: path.resolve('D:/Projects/cache/project-a'),
      legacyRoots: [legacyRoot],
      existsSync: () => false
    })

    expect(result.changed).toBe(false)
    expect(result.missing).toEqual([missing])
    expect(result.data).toBe(input)
  })

  it('rewrites relative legacy videos without copying large media', () => {
    const legacyRoot = path.resolve('C:/Users/test/AppData/Roaming/app/LocalCache')
    const source = path.join(legacyRoot, 'videos', 'clip.mp4')
    const copied = []
    const input = {
      nodes: [{ id: 'n1', settings: { manualVideos: ['LocalCache/videos/clip.mp4'] } }]
    }

    const result = migrateLegacyLocalCacheReferences(input, {
      projectCacheRoot: path.resolve('D:/Projects/cache/project-a'),
      legacyRoots: [legacyRoot],
      existsSync: (filePath) => path.resolve(filePath) === path.resolve(source),
      copyFileSync: (from, to) => copied.push({ from, to })
    })

    expect(result.changed).toBe(true)
    expect(result.copied).toBe(0)
    expect(result.preserved).toBe(1)
    expect(copied).toHaveLength(0)
    expect(result.data.nodes[0].settings.manualVideos[0]).toContain('xinghe://local/?path=')
    expect(decodeURIComponent(result.data.nodes[0].settings.manualVideos[0])).toContain(source)
  })
})
