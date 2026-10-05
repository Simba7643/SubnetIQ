import metadata from '@data/articles.json';
const files = import.meta.glob('../../../../content/blog/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
export interface Article {
  id: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  readingMinutes: number;
  body: string;
}
export const articles: Article[] = metadata.map((entry) => {
  const source = Object.entries(files).find(([path]) => path.endsWith(`/${entry.file}`))?.[1] ?? '';
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return { ...entry, body };
});
