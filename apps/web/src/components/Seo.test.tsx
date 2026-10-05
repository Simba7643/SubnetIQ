import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import courses from '@data/courses.json';
import articles from '@data/articles.json';
import { toolDefinitions } from '@/features/calculators/toolDefinitions';
import { Seo, publicPageDescriptions, resolvePageMetadata } from './Seo';

beforeEach(() => {
  document.head
    .querySelectorAll('meta, link[rel="canonical"], script[type="application/ld+json"]')
    .forEach((element) => element.remove());
  vi.stubEnv('VITE_SITE_URL', 'https://subnetiq.example');
  vi.stubEnv('VITE_APP_NAME', 'SubnetIQ');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('public metadata coverage', () => {
  it.each(Object.entries(publicPageDescriptions))(
    'resolves the public page %s',
    async (path, [title, description]) => {
      expect(await resolvePageMetadata(path)).toMatchObject({ title, description, public: true });
    },
  );

  it.each(toolDefinitions)('resolves the actual metadata for $id', async (tool) => {
    expect(await resolvePageMetadata(`/tools/${tool.id}`)).toMatchObject({
      title: tool.title,
      description: tool.description,
      public: true,
      schema: { '@type': 'SoftwareApplication' },
    });
  });

  it.each(courses)('uses the full course metadata for $id', async (course) => {
    expect(await resolvePageMetadata(`/learn/${course.id}`)).toMatchObject({
      title: course.title,
      description: course.description,
      public: true,
      schema: { '@type': 'Course' },
    });
  });

  it.each(articles)('uses article metadata and publication dates for $id', async (article) => {
    expect(await resolvePageMetadata(`/blog/${article.id}`)).toMatchObject({
      title: article.title,
      description: article.description,
      public: true,
      schema: { '@type': 'BlogPosting', datePublished: article.publishedAt },
    });
  });

  it('resolves every toolkit section from its actual catalog', async () => {
    const { toolkitSections } = await import('@/features/toolkit/ToolkitPage');
    for (const section of toolkitSections)
      expect(await resolvePageMetadata(`/toolkit/${section.id}`)).toMatchObject({
        title: section.title,
        description: section.description,
        public: true,
      });
  });

  it.each([
    '/not-a-page',
    '/tools/missing',
    '/learn/missing',
    '/blog/missing',
    '/toolkit/missing',
    '/404',
  ])('keeps unknown route %s out of the index', async (path) => {
    expect(await resolvePageMetadata(path)).toMatchObject({
      title: 'Page not found',
      public: false,
    });
  });

  it.each([
    '/auth',
    '/login',
    '/account',
    '/projects',
    '/projects/example',
    '/share/private-token',
    '/assistant',
  ])('keeps private route %s out of the index', async (path) => {
    expect((await resolvePageMetadata(path)).public).toBe(false);
  });
});

it('preserves the matching prerendered schema and replaces metadata after navigation', async () => {
  const user = userEvent.setup();
  const schema = document.createElement('script');
  schema.id = 'page-schema';
  schema.type = 'application/ld+json';
  schema.dataset.pagePath = '/';
  schema.dataset.pageUrl = 'https://subnetiq.example/';
  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'FAQPage', name: 'Home FAQ' }],
  });
  document.head.appendChild(schema);
  const view = render(
    <MemoryRouter>
      <Seo />
      <Link to={`/blog/${articles[0].id}`}>Open article</Link>
      <Link to="/not-a-page">Open missing page</Link>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.title).toBe('Network clarity, bit by bit | SubnetIQ'));
  expect(JSON.parse(schema.textContent || '{}')['@graph'][0]['@type']).toBe('FAQPage');
  expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  await user.click(view.getByRole('link', { name: 'Open article' }));
  await waitFor(() => expect(document.title).toBe(`${articles[0].title} | SubnetIQ`));
  expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
    'content',
    articles[0].description,
  );
  expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  expect(JSON.parse(schema.textContent || '{}')['@graph'][1]).toMatchObject({
    '@type': 'BlogPosting',
    headline: articles[0].title,
  });
  expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  await user.click(view.getByRole('link', { name: 'Open missing page' }));
  await waitFor(() => expect(document.title).toBe('Page not found | SubnetIQ'));
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow, noarchive',
  );
  expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://subnetiq.example/not-a-page',
  );
  expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  expect(JSON.parse(schema.textContent || '{}')['@graph'][1].url).toBe(
    'https://subnetiq.example/not-a-page',
  );
});
