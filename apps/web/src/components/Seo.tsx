import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ENGINE_VERSION } from '@subnetiq/shared';
import { toolDefinitions } from '@/features/calculators/toolDefinitions';

export const publicPageDescriptions: Record<string, [string, string]> = {
  '/': [
    'Network clarity, bit by bit',
    'Calculate IPv4 and IPv6 subnets, plan VLSM networks, and learn the reasoning behind every result with SubnetIQ.',
  ],
  '/tools': [
    'IP and subnetting calculators',
    'Browse IPv4, IPv6, VLSM, CIDR, address-conversion, bandwidth, and MTU calculators with exact results and worked explanations.',
  ],
  '/learn': [
    'Networking and subnetting learning path',
    'Study twelve complete networking lessons, from binary and CIDR through VLSM, IPv6, NAT, DHCP, DNS, and routing.',
  ],
  '/glossary': [
    'Networking and subnetting glossary',
    'Explore explained networking terms with practical examples and related concepts across addressing, routing, switching, protocols, and security.',
  ],
  '/practice': [
    'Subnetting practice lab and quizzes',
    'Practice subnetting with generated and curated questions, explanations, timers, scoring, streaks, and topic feedback.',
  ],
  '/cheatsheets': [
    'Printable networking cheat sheets',
    'Print CIDR masks, powers of two, private address ranges, common ports, and OSI/TCP-IP reference tables.',
  ],
  '/toolkit': [
    'Networking and cybersecurity toolkit',
    'Explore protocol references, DNS and registration lookups, firewall helpers, local password and hash tools, and defensive learning cards.',
  ],
  '/templates': [
    'Home, SMB, campus, and data-center network templates',
    'Start from four complete sample address plans with VLANs, gateways, purpose, IPv4 networks, and paired IPv6 examples.',
  ],
  '/blog': [
    'Networking field notes and worked guides',
    'Read five original practical guides on CIDR host counts, VLSM, IPv6 planning, wildcard masks, and DNS troubleshooting.',
  ],
  '/about': [
    'About SubnetIQ',
    'Learn how SubnetIQ connects exact address mathematics, clear explanations, guided learning, and practical network planning.',
  ],
  '/contact': [
    'Contact and feedback',
    'Send feedback about calculations, explanations, accessibility, or this SubnetIQ installation to its operator.',
  ],
  '/privacy': ['Privacy policy', 'How this installation handles your information.'],
  '/terms': ['Terms of use', 'Practical terms for the networking workspace.'],
  '/cookies': ['Cookies & local preferences', 'Simple controls for optional analytics.'],
};

export interface PageMetadata {
  title: string;
  description: string;
  public: boolean;
  schema: Record<string, unknown>;
}

const privateNames: Record<string, string> = {
  auth: 'Sign in',
  login: 'Sign in',
  account: 'Your account',
  projects: 'Your network projects',
  share: 'Shared network plan',
  assistant: 'Networking assistant',
};

const missing: PageMetadata = {
  title: 'Page not found',
  description:
    'This address does not match a SubnetIQ page. Browse the calculator suite, learning path, or networking toolkit.',
  public: false,
  schema: { '@type': 'WebPage' },
};

export async function resolvePageMetadata(pathname: string): Promise<PageMetadata> {
  const base = publicPageDescriptions[pathname];
  if (base)
    return { title: base[0], description: base[1], public: true, schema: { '@type': 'WebPage' } };
  const tool = toolDefinitions.find((entry) => `/tools/${entry.id}` === pathname);
  if (tool)
    return {
      title: tool.title,
      description: tool.description,
      public: true,
      schema: {
        '@type': 'SoftwareApplication',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web browser',
        softwareVersion: ENGINE_VERSION,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    };
  if (/^\/learn\/[^/]+$/.test(pathname)) {
    const { default: courses } = await import('@data/courses.json');
    const course = courses.find((entry) => `/learn/${entry.id}` === pathname);
    return course
      ? {
          title: course.title,
          description: course.description,
          public: true,
          schema: {
            '@type': 'Course',
            educationalLevel: course.category,
            isAccessibleForFree: true,
          },
        }
      : missing;
  }
  if (/^\/blog\/[^/]+$/.test(pathname)) {
    const { default: articles } = await import('@data/articles.json');
    const article = articles.find((entry) => `/blog/${entry.id}` === pathname);
    return article
      ? {
          title: article.title,
          description: article.description,
          public: true,
          schema: {
            '@type': 'BlogPosting',
            headline: article.title,
            datePublished: article.publishedAt,
            dateModified: article.publishedAt,
          },
        }
      : missing;
  }
  if (/^\/toolkit\/[^/]+$/.test(pathname)) {
    const { toolkitSections } = await import('@/features/toolkit/ToolkitPage');
    const section = toolkitSections.find((entry) => `/toolkit/${entry.id}` === pathname);
    return section
      ? {
          title: section.title,
          description: section.description,
          public: true,
          schema: { '@type': 'WebPage' },
        }
      : missing;
  }
  const privateMatch = /^\/(auth|login|account|projects|share|assistant)(?:\/|$)/.exec(pathname);
  if (privateMatch)
    return {
      title: privateNames[privateMatch[1]],
      description:
        'Your SubnetIQ account and workspace tools. Private account information is excluded from search indexing.',
      public: false,
      schema: { '@type': 'WebPage' },
    };
  return missing;
}

function setMeta(name: string, content: string, property = false) {
  const selector = `meta[${property ? 'property' : 'name'}="${name}"]`;
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(property ? 'property' : 'name', name);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    let active = true;
    const apply = (page: PageMetadata) => {
      if (!active) return;
      const appName = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'SubnetIQ';
      const base = (import.meta.env.VITE_SITE_URL as string | undefined) || location.origin;
      const url = new URL(pathname, base).href;
      document.title = `${page.title} | ${appName}`;
      setMeta('description', page.description);
      setMeta(
        'robots',
        page.public ? 'index, follow, max-image-preview:large' : 'noindex, nofollow, noarchive',
      );
      setMeta('og:site_name', appName, true);
      setMeta('og:title', document.title, true);
      setMeta('og:description', page.description, true);
      setMeta('og:type', page.schema['@type'] === 'BlogPosting' ? 'article' : 'website', true);
      setMeta('og:url', url, true);
      setMeta('og:image', new URL('/social-card.png', base).href, true);
      setMeta('og:image:width', '1200', true);
      setMeta('og:image:height', '630', true);
      setMeta('og:image:alt', `${appName}: Network clarity, bit by bit`, true);
      setMeta('twitter:card', 'summary_large_image');
      setMeta('twitter:title', document.title);
      setMeta('twitter:description', page.description);
      setMeta('twitter:image', new URL('/social-card.png', base).href);
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = url;
      let schema = document.querySelector<HTMLScriptElement>('#page-schema');
      if (schema?.dataset.pagePath === pathname && schema.dataset.pageUrl === url && page.public)
        return;
      document
        .querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
        .forEach((entry) => {
          if (entry !== schema) entry.remove();
        });
      if (!schema) {
        schema = document.createElement('script');
        schema.id = 'page-schema';
        schema.type = 'application/ld+json';
        document.head.appendChild(schema);
      }
      const website = new URL('/', base).href;
      const provider = { '@type': 'Organization', name: appName };
      schema.dataset.pagePath = pathname;
      schema.dataset.pageUrl = url;
      schema.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': `${website}#website`, name: appName, url: website },
          {
            '@type': 'WebPage',
            '@id': `${url}#page`,
            name: page.title,
            description: page.description,
            url,
            inLanguage: 'en',
            isPartOf: { '@id': `${website}#website` },
            image: new URL('/social-card.png', base).href,
            ...page.schema,
            ...(page.schema['@type'] === 'Course' ? { provider } : {}),
            ...(page.schema['@type'] === 'BlogPosting'
              ? {
                  mainEntityOfPage: url,
                  publisher: {
                    ...provider,
                    logo: {
                      '@type': 'ImageObject',
                      url: new URL('/icon-512.png', base).href,
                      width: 512,
                      height: 512,
                    },
                  },
                }
              : {}),
          },
        ],
      });
    };
    void resolvePageMetadata(pathname).then(apply, () => apply(missing));
    return () => {
      active = false;
    };
  }, [pathname]);
  return null;
}
