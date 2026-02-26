import type { Node, Edge } from '@vue-flow/core'
import type { TreeSubgraph, TreePerson } from '@/types'

const NODE_W = 180
const NODE_H = 80
const H_GAP  = 44
const V_GAP  = 100

const GEN_Y: Record<number, number> = {
  [-2]: -2 * (NODE_H + V_GAP),
  [-1]: -1 * (NODE_H + V_GAP),
  [0]:  0,
  [1]:  NODE_H + V_GAP,
}

type NodeData = { person: TreePerson; isRoot: boolean }

function rowX(index: number, total: number): number {
  const totalWidth = total * NODE_W + (total - 1) * H_GAP
  return index * (NODE_W + H_GAP) - totalWidth / 2 + NODE_W / 2
}

export function buildTreeLayout(subgraph: TreeSubgraph): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const { rootId, people, parentChildEdges, marriageEdges } = subgraph

  // ── Assign generations ──────────────────────────────────────────────────────
  const generations = new Map<string, number>()
  generations.set(rootId, 0)

  for (const e of parentChildEdges) {
    if (e.childId === rootId) generations.set(e.parentId, -1)
  }
  for (const e of parentChildEdges) {
    const childGen = generations.get(e.childId)
    if (childGen === -1) generations.set(e.parentId, -2)
  }
  for (const e of parentChildEdges) {
    if (e.parentId === rootId) generations.set(e.childId, 1)
  }

  // Spouses inherit the same generation as their partner
  for (const m of marriageEdges) {
    if (generations.has(m.personAId) && !generations.has(m.personBId)) {
      generations.set(m.personBId, generations.get(m.personAId)!)
    } else if (generations.has(m.personBId) && !generations.has(m.personAId)) {
      generations.set(m.personAId, generations.get(m.personBId)!)
    }
  }

  for (const p of people) {
    if (!generations.has(p.id)) generations.set(p.id, 0)
  }

  // ── Group by generation ─────────────────────────────────────────────────────
  const byGen = new Map<number, TreePerson[]>()
  for (const p of people) {
    const g = generations.get(p.id) ?? 0
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(p)
  }

  // ── Build nodes ─────────────────────────────────────────────────────────────
  const nodes: Node<NodeData>[] = []
  for (const [gen, row] of byGen) {
    const y = GEN_Y[gen] ?? gen * (NODE_H + V_GAP)
    row.forEach((p, i) => {
      nodes.push({
        id: p.id,
        type: 'person',
        position: { x: rowX(i, row.length), y },
        data: { person: p, isRoot: p.id === rootId },
      })
    })
  }

  // ── Build edges ─────────────────────────────────────────────────────────────
  const edges: Edge[] = []

  for (const e of parentChildEdges) {
    edges.push({
      id: `pc-${e.id}`,
      source: e.parentId,
      target: e.childId,
      type: 'smoothstep',
      style: e.confirmed
        ? { stroke: '#8B6F5E', strokeWidth: 1.5 }
        : { stroke: '#8B6F5E', strokeWidth: 1.5, strokeDasharray: '6,4' },
    })
  }

  for (const m of marriageEdges) {
    edges.push({
      id: `m-${m.id}`,
      source: m.personAId,
      target: m.personBId,
      type: 'straight',
      style: { stroke: '#C4856A', strokeWidth: 2 },
    })
  }

  return { nodes, edges }
}
