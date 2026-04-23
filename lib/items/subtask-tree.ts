import type { InboxItem } from "./types";

export interface TreeNode {
  item: InboxItem;
  children: TreeNode[];
  depth: number;
}

export function buildSubtaskTree(items: InboxItem[]): TreeNode[] {
  const itemMap = new Map<string, InboxItem>();
  const childrenMap = new Map<string, InboxItem[]>();

  // Index items
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Group by parent
  for (const item of items) {
    const parentId = item.metadata?.parent_item_id;
    if (parentId && itemMap.has(parentId)) {
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(item);
      childrenMap.set(parentId, siblings);
    }
  }

  // Detect circular refs: walk ancestry chain
  const isCircular = (itemId: string): boolean => {
    const visited = new Set<string>();
    let current = itemId;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      const parent = itemMap.get(current)?.metadata?.parent_item_id;
      if (!parent || !itemMap.has(parent)) break;
      current = parent;
    }
    return false;
  };

  // Build tree recursively
  const buildNode = (item: InboxItem, depth: number, visited: Set<string>): TreeNode => {
    visited.add(item.id);
    let children = childrenMap.get(item.id) ?? [];

    // Respect subtask_order if present on parent
    const order = (item.metadata as Record<string, unknown>)?.subtask_order as string[] | undefined;
    if (order && Array.isArray(order)) {
      const orderMap = new Map(order.map((id, idx) => [id, idx]));
      children = [...children].sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Infinity;
        const bi = orderMap.get(b.id) ?? Infinity;
        return ai - bi;
      });
    }

    return {
      item,
      depth,
      children: children
        .filter((c) => !visited.has(c.id))
        .map((c) => buildNode(c, depth + 1, visited)),
    };
  };

  // Roots: items with no parent, or orphans (parent not in list), or circular refs
  const roots: InboxItem[] = [];
  for (const item of items) {
    const parentId = item.metadata?.parent_item_id;
    if (!parentId || !itemMap.has(parentId)) {
      roots.push(item);
    }
  }

  // For circular items, add them as roots too
  for (const item of items) {
    if (item.metadata?.parent_item_id && itemMap.has(item.metadata.parent_item_id) && isCircular(item.id) && !roots.includes(item)) {
      roots.push(item);
    }
  }

  const visited = new Set<string>();
  return roots.map((item) => buildNode(item, 0, visited));
}

export function getSubtaskProgress(node: TreeNode): { completed: number; total: number } {
  let completed = 0;
  let total = 0;

  for (const child of node.children) {
    total++;
    if (child.item.status === "completed") completed++;
    const sub = getSubtaskProgress(child);
    completed += sub.completed;
    total += sub.total;
  }

  return { completed, total };
}

export function flattenTree(nodes: TreeNode[]): InboxItem[] {
  const result: InboxItem[] = [];
  const walk = (node: TreeNode) => {
    result.push(node.item);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
}
