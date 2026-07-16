const ADJECTIVES = ['calm', 'shiny', 'sweet', 'bright', 'gentle', 'quiet', 'bold', 'clear'];
const NOUNS = ['orbit', 'feather', 'dawn', 'river', 'meadow', 'comet', 'cedar', 'harbor'];

export function generateLearnerCommitName(existingNames: Iterable<string>, random = Math.random): string {
  const usedNames = new Set(existingNames);
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)] ?? ADJECTIVES[0]!;
  const noun = NOUNS[Math.floor(random() * NOUNS.length)] ?? NOUNS[0]!;
  const base = `${adjective}-${noun}`;

  if (!usedNames.has(base)) {
    return base;
  }

  let suffix = 2;

  while (usedNames.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}
