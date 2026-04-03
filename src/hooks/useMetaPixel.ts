import { useEffect } from 'react';

export function useMetaPixel(pixelId: string, trackLead = false) {
  useEffect(() => {
    // Avoid duplicate loads
    if ((window as any).fbq) {
      (window as any).fbq('init', pixelId);
      (window as any).fbq('track', 'PageView');
      if (trackLead) (window as any).fbq('track', 'Lead');
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);

    const n: any = ((window as any).fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!(window as any)._fbq) (window as any)._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];

    n('init', pixelId);
    n('track', 'PageView');
    if (trackLead) n('track', 'Lead');

    // noscript fallback
    const noscript = document.createElement('noscript');
    const img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
    noscript.appendChild(img);
    document.body.appendChild(noscript);

    return () => {
      script.remove();
      noscript.remove();
    };
  }, [pixelId]);
}
