export type OrderedContentItem = {
  id: string;
  moduleId: string | null;
};

export class ContentOrderingError extends Error {
  constructor(readonly code: "ITEM_NOT_FOUND" | "NO_MOVE") {
    super(code === "ITEM_NOT_FOUND" ? "Материал не найден" : "Материал уже находится на границе раздела");
    this.name = "ContentOrderingError";
  }
}

export function reorderContentItem(args: {
  moduleIds: string[];
  items: OrderedContentItem[];
  itemId: string;
  direction: "up" | "down";
}) {
  const moduleOrder: Array<string | null> = [...args.moduleIds, null];
  const groups = moduleOrder.map((moduleId) => ({
    moduleId,
    items: args.items.filter((item) => item.moduleId === moduleId),
  }));
  const group = groups.find((candidate) => candidate.items.some((item) => item.id === args.itemId));
  if (!group) throw new ContentOrderingError("ITEM_NOT_FOUND");

  const currentIndex = group.items.findIndex((item) => item.id === args.itemId);
  const targetIndex = args.direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= group.items.length) {
    throw new ContentOrderingError("NO_MOVE");
  }
  const next = [...group.items];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  group.items = next;
  return groups.flatMap((candidate) => candidate.items).map((item, orderIndex) => ({
    id: item.id,
    orderIndex,
  }));
}
