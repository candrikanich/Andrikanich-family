import { describe, it, expect } from 'vitest'
import { buildTreeLayout } from '@/composables/useTreeLayout'
import type { TreeSubgraph } from '@/types'

function person(id: string): import('@/types').TreePerson {
  return { id, firstName: 'A', lastName: 'B', birthSurname: null, nickname: null, birthDate: null, deathDate: null, primaryPhotoId: null }
}

describe('buildTreeLayout', () => {
  it('places root at generation 0 center', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root')],
      parentChildEdges: [],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const rootNode = nodes.find(n => n.id === 'root')
    expect(rootNode).toBeDefined()
    expect(rootNode!.position.x).toBe(0)
    expect(rootNode!.position.y).toBe(0)
    expect(rootNode!.data.isRoot).toBe(true)
  })

  it('places a parent above root (negative y)', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: true }],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const parentNode = nodes.find(n => n.id === 'parent1')
    expect(parentNode).toBeDefined()
    expect(parentNode!.position.y).toBeLessThan(0)
  })

  it('places a child below root (positive y)', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('child1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'root', childId: 'child1', confirmed: true }],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const childNode = nodes.find(n => n.id === 'child1')
    expect(childNode).toBeDefined()
    expect(childNode!.position.y).toBeGreaterThan(0)
  })

  it('creates a solid edge for a confirmed parent-child relationship', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: true }],
      marriageEdges: [],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'pc-pc1')
    expect(edge).toBeDefined()
    expect(edge!.style?.strokeDasharray).toBeUndefined()
  })

  it('creates a dashed edge for an unconfirmed parent-child relationship', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: false }],
      marriageEdges: [],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'pc-pc1')
    expect(edge!.style?.strokeDasharray).toBeDefined()
  })

  it('creates an edge for a marriage', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('spouse1')],
      parentChildEdges: [],
      marriageEdges: [{ id: 'm1', personAId: 'root', personBId: 'spouse1', marriageDate: null }],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'm-m1')
    expect(edge).toBeDefined()
    expect(edge!.source).toBe('root')
    expect(edge!.target).toBe('spouse1')
  })
})
