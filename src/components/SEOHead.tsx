import { useEffect } from 'react';

interface SEOHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  keywords?: string;
  jsonLd?: object | object[];
}

/**
 * Sets document <title>, meta description, canonical, OG tags,
 * and injects JSON-LD structured data for the current page.
 */
export default function SEOHead({ title, description, canonical, ogImage, keywords, jsonLd }: SEOHeadProps) {
  useEffect(() => {
    // Title
    document.title = title;

    // Helper to set/create a meta tag
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', description);
    if (keywords) setMeta('name', 'keywords', keywords);
    setMeta('name', 'robots', 'index, follow');

    // Open Graph
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', canonical);
    if (ogImage) setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:locale', 'en_US');

    // Twitter
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    if (ogImage) setMeta('name', 'twitter:image', ogImage);

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    // Geo meta tags for Las Vegas local SEO
    setMeta('name', 'geo.region', 'US-NV');
    setMeta('name', 'geo.placename', 'Las Vegas');
    setMeta('name', 'geo.position', '36.1699;-115.1398');
    setMeta('name', 'ICBM', '36.1699, -115.1398');

    // JSON-LD
    const ldScripts: HTMLScriptElement[] = [];
    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      items.forEach((data) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
        ldScripts.push(script);
      });
    }

    return () => {
      ldScripts.forEach((s) => s.remove());
    };
  }, [title, description, canonical, ogImage, keywords, jsonLd]);

  return null;
}
