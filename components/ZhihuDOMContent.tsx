'use dom';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/dist/contrib/auto-render.js';

interface SegmentInfo {
  pid: string;
  marks: Array<{
    seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
    };
    master_seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
    };
  }>;
}

interface ZhihuDOMContentProps {
  htmlContent: string;
  segmentInfos?: SegmentInfo[];
  colorScheme: 'light' | 'dark';
  onImagePress: (src: string) => void;
  onLinkPress: (href: string) => void;
  onSegmentPress: (pid: string) => void;
}

export default function ZhihuDOMContent({
  htmlContent,
  segmentInfos,
  colorScheme,
  onImagePress,
  onLinkPress,
  onSegmentPress,
}: ZhihuDOMContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cssLoaded, setCssLoaded] = useState(false);
  const [mathRendered, setMathRendered] = useState(false);

  // 0. Pre-process HTML content for images and protocols before rendering
  const processedHtml = React.useMemo(() => {
    if (!htmlContent) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const images = doc.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src') || '';
      const eeimg = img.getAttribute('eeimg');
      const isFormula = src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
      const alt = img.getAttribute('alt') || '';

      if (isFormula && alt) {
        // Improved detection: treat \begin or \\ as block formula even if eeimg="1"
        const isBlockFormula = eeimg === '2' || alt.includes('\\begin') || alt.includes('\\\\');
        const textContent = isBlockFormula ? `$$${alt}$$` : `$${alt}$`;
        const textNode = doc.createTextNode(textContent);
        img.parentNode?.replaceChild(textNode, img);
      } else if (!isFormula) {
        let actualSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || src;
        if (actualSrc) {
          actualSrc = actualSrc.trim();
          if (actualSrc.startsWith('//')) actualSrc = 'https:' + actualSrc;
          img.setAttribute('src', actualSrc);
        }
        img.removeAttribute('width');
        img.removeAttribute('height');
      }
    });

    return doc.body.innerHTML;
  }, [htmlContent]);

  // Handle KaTeX auto-render and Interaction Styling
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // 2. Run auto-render
    renderMathInElement(containerRef.current, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false,
      strict: false,
    });

    // 3. Apply segment interactable classes
    if (segmentInfos) {
      const paragraphs = containerRef.current.querySelectorAll('p[data-pid]');
      paragraphs.forEach((p) => {
        const pid = p.getAttribute('data-pid');
        if (!pid) return;

        const segment = segmentInfos.find(s => s.pid === pid);
        if (!segment) return;

        const marks = segment.marks;
        if (!marks || marks.length === 0) return;

        let interaction = null;
        for (const mark of marks) {
          if (mark.seg_info?.is_like) { interaction = mark.seg_info; break; }
          if (mark.master_seg_info?.is_like) { interaction = mark.master_seg_info; break; }
        }
        if (!interaction) {
          interaction = marks[0].seg_info || marks[0].master_seg_info;
        }

        if (
          interaction &&
          (interaction.like_count > 0 || interaction.comment_count > 0 || interaction.is_like)
        ) {
          p.classList.add('segment-interactable');
          if (interaction.is_like) {
            p.classList.add('segment-liked');
          }
        }
      });
    }

    // Reveal immediately
    setMathRendered(true);
  }, [processedHtml, segmentInfos]);

  // Handle Clicks
  const handleClick = (e: React.MouseEvent) => {
    let target = e.target as HTMLElement | null;

    while (target && target !== containerRef.current) {
      if (target.tagName === 'IMG') {
        const src = target.getAttribute('src');
        if (src) onImagePress(src);
        return;
      }
      if (target.tagName === 'A') {
        e.preventDefault();
        const href = target.getAttribute('href');
        if (href) onLinkPress(href);
        return;
      }
      if ((target.tagName === 'P' || target.tagName === 'SPAN') && target.classList.contains('segment-interactable')) {
        const pid = target.getAttribute('data-pid');
        if (pid) onSegmentPress(pid);
        return;
      }
      target = target.parentElement;
    }
  };

  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#ffffff' : '#1a1a1a';
  const surfaceColor = isDark ? '#121212' : '#ffffff';
  const primaryColor = '#0084ff';


  return (
    <div style={{ width: '100%', backgroundColor: 'transparent' }}>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        onLoad={() => setCssLoaded(true)}
        onError={() => setCssLoaded(true)}
      />
      <style>{`
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
          max-width: 100vw;
          overflow-x: hidden;
        }
        .zhihu-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 17px;
          line-height: 1.6;
          color: ${textColor};
          max-width: 100%;
        }
        .katex { color: ${textColor}; }
        .katex-display {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 0;
        }
        pre, code {
          max-width: 100%;
          overflow-x: auto;
          color: ${textColor};
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 14px;
        }
        .highlight {
          background-color: ${isDark ? '#1a1a1a' : '#f6f6f6'};
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border: 1px solid ${isDark ? '#333' : '#eee'};
        }
        .zhihu-content p {
          margin-bottom: 20px;
        }
        .zhihu-content img {
          max-width: 100%;
          border-radius: 12px;
          margin: 10px 0;
          cursor: pointer;
        }
        .zhihu-content figure {
          margin: 15px 0;
          text-align: center;
        }
        .zhihu-content figcaption {
          color: ${isDark ? '#888' : '#999'};
          font-size: 13px;
          margin-top: 8px;
          font-style: italic;
        }
        .zhihu-content a {
          color: ${primaryColor};
          text-decoration: none;
        }
        .zhihu-content blockquote {
          border-left: 4px solid ${primaryColor};
          padding-left: 18px;
          background-color: ${isDark ? '#1a1a1a' : '#f6f6f6'};
          padding: 12px 18px;
          margin: 15px 0;
          font-style: italic;
          color: ${textColor};
        }
        .zhihu-content h1, .zhihu-content h2, .zhihu-content h3 { color: ${textColor}; }
        .zhihu-content h1 { font-size: 22px; font-weight: bold; margin: 20px 0; line-height: 1.4; }
        .zhihu-content h2 { font-size: 20px; font-weight: bold; margin: 18px 0; line-height: 1.4; }
        .zhihu-content h3 { font-size: 18px; font-weight: bold; margin: 15px 0; line-height: 1.4; }
        .zhihu-content ul, .zhihu-content ol { padding-left: 20px; margin: 10px 0; }
        .zhihu-content li { margin-bottom: 8px; font-size: 17px; }
        .zhihu-content hr { height: 1px; background-color: rgba(150,150,150,0.2); border: none; margin: 25px 0; }
        
        .segment-interactable {
          text-decoration: underline;
          text-decoration-color: ${primaryColor}80;
          cursor: pointer;
          border-radius: 8px;
          padding: 4px;
          margin: -4px;
        }
        .segment-liked {
          background-color: ${isDark ? 'rgba(0, 132, 255, 0.15)' : 'rgba(0, 132, 255, 0.05)'};
        }
      `}</style>

      <div
        ref={containerRef}
        className="zhihu-content"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
        style={{
          color: textColor,
        }}
      />
    </div>
  );
}
