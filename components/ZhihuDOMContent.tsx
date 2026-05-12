import React, { useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

interface ZhihuDOMContentProps {
  htmlContent: string;
  segmentInfosStr?: string;
  colorScheme: 'light' | 'dark';
  onImagePress: (src: string) => void;
  onLinkPress: (href: string) => void;
  onSegmentPress: (pid: string) => void;
  onReady?: () => void;
  style?: object;
}

export default React.memo(function ZhihuDOMContent({
  htmlContent,
  segmentInfosStr,
  colorScheme,
  onImagePress,
  onLinkPress,
  onSegmentPress,
  onReady,
  style,
}: ZhihuDOMContentProps) {
  const [height, setHeight] = useState(400);
  const [_loading, _setLoading] = useState(true);

  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#ffffff' : '#1a1a1a';
  const primaryColor = '#0084ff';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
          max-width: 100%;
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
          height: auto !important;
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
      </style>
    </head>
    <body>
      <div id="content" class="zhihu-content"></div>
      <script>
        const htmlContent = ${JSON.stringify(htmlContent)};
        const segmentInfosStr = ${JSON.stringify(segmentInfosStr || '[]')};
        
        const container = document.getElementById('content');
        container.innerHTML = htmlContent;

        // Process images
        const images = container.querySelectorAll('img');
        images.forEach((img) => {
          const src = img.getAttribute('src') || '';
          const eeimg = img.getAttribute('eeimg');
          const isFormula = src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
          const alt = img.getAttribute('alt') || '';

          if (isFormula && alt) {
            const isBlockFormula = eeimg === '2' || alt.includes('\\\\begin') || alt.includes('\\\\\\\\');
            const textContent = isBlockFormula ? '$$' + alt + '$$' : '$' + alt + '$';
            const textNode = document.createTextNode(textContent);
            img.parentNode?.replaceChild(textNode, img);
          } else if (!isFormula) {
            let actualSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || src;
            if (actualSrc) {
              actualSrc = actualSrc.trim();
              if (actualSrc.startsWith('//')) actualSrc = 'https:' + actualSrc;
              img.setAttribute('src', actualSrc);
            }

            const rawwidth = img.getAttribute('data-rawwidth');
            const rawheight = img.getAttribute('data-rawheight');
            if (rawwidth && rawheight) {
              img.setAttribute('width', rawwidth);
              img.setAttribute('height', rawheight);
              img.style.aspectRatio = rawwidth + ' / ' + rawheight;
            }
          }
        });

        // Process segments
        try {
          const segmentInfos = JSON.parse(segmentInfosStr);
          if (segmentInfos && segmentInfos.length > 0) {
            const paragraphs = container.querySelectorAll('p[data-pid]');
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
        } catch (e) {
          console.error('Failed to parse segmentInfos', e);
        }

        // Render Math
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false,
          strict: false,
        });

        // Click handlers
        container.addEventListener('click', function(e) {
          let target = e.target;
          while (target && target !== container) {
            if (target.tagName === 'IMG') {
              const src = target.getAttribute('src');
              if (src) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'image', src }));
                return;
              }
            }
            if (target.tagName === 'A') {
              e.preventDefault();
              const href = target.getAttribute('href');
              if (href) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link', href }));
                return;
              }
            }
            if ((target.tagName === 'P' || target.tagName === 'SPAN') && target.classList.contains('segment-interactable')) {
              const pid = target.getAttribute('data-pid');
              if (pid) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'segment', pid }));
                return;
              }
            }
            target = target.parentElement;
          }
        });

        // Send height
        function sendHeight() {
          const height = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight,
            container.scrollHeight
          );
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height }));
        }
        
        // Wait for images and fonts to load
        window.onload = sendHeight;
        setTimeout(sendHeight, 100);
        setTimeout(sendHeight, 500);
        setTimeout(sendHeight, 1000);
        setTimeout(sendHeight, 2000);
        
        // Resize observer for dynamic content
        if (window.ResizeObserver) {
          const observer = new ResizeObserver(sendHeight);
          observer.observe(document.body);
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[{ width: '100%', height }, style]}>
      <WebView
        source={{ html }}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'height') {
              setHeight(data.height);
              onReady?.();
            } else if (data.type === 'image') {
              onImagePress(data.src);
            } else if (data.type === 'link') {
              onLinkPress(data.href);
            } else if (data.type === 'segment') {
              onSegmentPress(data.pid);
            }
          } catch (e) {
            console.error('Failed to parse message from WebView', e);
          }
        }}
      />
    </View>
  );
});
