export function selectCourseStructureEditor<
  TItem extends { id: string },
  TModule extends { id: string },
>(args: {
  items: TItem[];
  modules: TModule[];
  selectedItemId?: string;
  selectedModuleId?: string;
}) {
  return {
    selectedItem: args.selectedItemId
      ? args.items.find((item) => item.id === args.selectedItemId) ?? null
      : null,
    selectedModule: args.selectedModuleId
      ? args.modules.find((courseModule) => courseModule.id === args.selectedModuleId) ?? null
      : null,
  };
}
