// Мини-склейка классов без зависимостей. Пустые/ложные значения отбрасываются,
// className вызывающего добавляется последним.
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
