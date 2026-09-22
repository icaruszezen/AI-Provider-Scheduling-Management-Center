import type { ProviderBrand, ProviderResource } from './types';

export const channelGroupKey = (brand: ProviderBrand): string => {
  if (brand === 'openaiCompatibility') return 'openai-compatibility';
  if (brand === 'lmuAI') return 'lmu-ai';
  return brand;
};

/** Legacy sponsor cards keep the provider's fixed OpenAI name and unnamed protocol entries. */
export const sponsorChannelKey = (name: string | undefined | null, legacyName: string): string => {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || trimmed === legacyName) return '';
  return trimmed;
};

export const nextCopyName = (
  sourceName: string | null | undefined,
  taken: Iterable<string>
): string => {
  const used = new Set(
    Array.from(taken, (name) => String(name ?? '').trim()).filter((name) => name.length > 0)
  );
  const source = String(sourceName ?? '').trim();
  const stem = source ? `${source}-copy` : 'copy';
  if (!used.has(stem)) return stem;
  let index = 2;
  while (used.has(`${stem}-${index}`)) index += 1;
  return `${stem}-${index}`;
};

export interface ChannelSection {
  id: string;
  resources: ProviderResource[];
}

export const groupChannelResources = (
  resources: readonly ProviderResource[],
  catalog: readonly string[],
  filterActive: boolean
): ChannelSection[] => {
  const buckets = new Map<string, ProviderResource[]>();
  resources.forEach((resource) => {
    const key = String(resource.group ?? '').trim();
    const list = buckets.get(key) ?? [];
    list.push(resource);
    buckets.set(key, list);
  });

  const seen = new Set<string>();
  const sections: ChannelSection[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const items = buckets.get(id) ?? [];
    if (filterActive && items.length === 0) return;
    const resources = id
      ? [...items].sort(
          (left, right) =>
            (right.priority ?? 0) - (left.priority ?? 0) || left.originalIndex - right.originalIndex
        )
      : items;
    sections.push({ id, resources });
  };

  push('');
  catalog.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed) push(trimmed);
  });
  Array.from(buckets.keys())
    .filter((key) => key && !seen.has(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => push(key));

  if (!filterActive && sections.length === 0) {
    return [{ id: '', resources: [] }];
  }
  if (sections.length > 1 && sections[0]?.id === '' && sections[0].resources.length === 0) {
    return sections.slice(1);
  }
  return sections;
};
