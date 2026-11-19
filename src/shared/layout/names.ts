export const NAME_MAX = 40

// Why a saved layout can't have this name, in words for the field, or null when it's fine.
// `taken`: the other saved layouts' names on this device. Case and accents don't count: "work" is "Work".
const collator = new Intl.Collator('en', { sensitivity: 'base' })
export function checkLayoutName(name: string, taken: readonly string[]): string | null {
  const clean = name.trim()
  if (!clean) return 'Give the layout a name.'
  if (clean.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`
  if (taken.some((other) => collator.compare(other.trim(), clean) === 0)) {
    return `A layout named “${clean}” already exists.`
  }
  return null
}
