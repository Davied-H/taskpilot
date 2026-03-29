/**
 * Lightweight fuzzy search scoring.
 * Characters must appear in order but not contiguously.
 * Bonuses for: consecutive matches, word boundary, start of string.
 * Returns 0 for no match, higher = better.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (q.length === 0) return 1 // empty query matches everything

  let score = 0
  let qi = 0
  let lastMatchIdx = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1
      if (ti === lastMatchIdx + 1) score += 2  // consecutive bonus
      if (ti === 0 || /[\s_\-/]/.test(t[ti - 1])) score += 3  // word boundary bonus
      lastMatchIdx = ti
      qi++
    }
  }

  return qi < q.length ? 0 : score
}

/**
 * Score an action against a query by checking label, labelEn, and keywords.
 * Returns the best score across all fields.
 */
export function scoreAction(
  query: string,
  label: string,
  labelEn?: string,
  keywords?: string[],
): number {
  let best = fuzzyScore(query, label)
  if (labelEn) best = Math.max(best, fuzzyScore(query, labelEn))
  if (keywords) {
    for (const kw of keywords) {
      best = Math.max(best, fuzzyScore(query, kw))
    }
  }
  return best
}
