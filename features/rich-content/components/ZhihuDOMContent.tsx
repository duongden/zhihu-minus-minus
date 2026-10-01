import React, { useMemo, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRuntimeThemeColors } from '@/components/Themed';
import { radii, typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import katexRuntime from '../assets/katex-runtime.json';
import katexStyle from '../assets/katex-style.json';
import {
  parseRichContentBridgeMessage,
  type TextSelectionInfo,
} from '../bridge';
import { DAILY_AVATAR_SIZE, type RichContentVariant } from '../imagePolicy';
import {
  createRichContentMetrics,
  RICH_CONTENT_LIST_ITEM_SPACING,
  RICH_CONTENT_PARAGRAPH_SPACING,
} from '../presentation';
import type { RichContentTypographyOptions } from '../types';
import {
  getSafeRichContentUrl,
  sanitizeRichContentHtml,
  serializeInlineScriptValue,
} from '../webviewSecurity';

export type { TextSelectionInfo } from '../bridge';

export interface ZhihuDOMContentProps {
  htmlContent: string;
  segmentInfosStr?: string;
  linkCardInfoStr?: string;
  colorScheme: 'light' | 'dark';
  onImagePress: (src: string) => void;
  onImageLongPress?: (src: string) => void;
  onLinkPress: (href: string) => void;
  onSegmentPress: (pid: string) => void;
  onTextSelected?: (info: TextSelectionInfo | null) => void;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: RichContentVariant;
  fontSizeScale?: number;
  lineHeightScale?: number;
  typographyOptions?: RichContentTypographyOptions;
}

export default React.memo(function ZhihuDOMContent({
  htmlContent,
  segmentInfosStr,
  linkCardInfoStr,
  onImagePress,
  onImageLongPress,
  onLinkPress,
  onSegmentPress,
  onTextSelected,
  onReady,
  style,
  variant = 'default',
  fontSizeScale: fontSizeOverride,
  lineHeightScale: lineHeightOverride,
  typographyOptions,
}: ZhihuDOMContentProps) {
  const [height, setHeight] = useState(400);
  const safeHtmlContent = useMemo(
    () => sanitizeRichContentHtml(htmlContent),
    [htmlContent],
  );

  const themeColors = useRuntimeThemeColors();
  const textColor = themeColors.text;
  const settings = useSettingsStore();
  const metrics = createRichContentMetrics(
    fontSizeOverride ?? settings.fontSizeScale,
    lineHeightOverride ?? settings.lineHeightScale,
  );
  const headingStyles = Object.entries(metrics.headings)
    .map(
      ([tag, metric]) =>
        `.zhihu-content ${tag} { font-size: ${metric.fontSize}px; line-height: ${metric.lineHeight}px; font-weight: bold; margin: ${metric.marginTop}px 0 ${metric.marginBottom}px; }`,
    )
    .join('\n');
  const primaryColor = themeColors.link;
  const dailyStyles =
    variant === 'daily'
      ? `
        .zhihu-content .meta {
          display: flex;
          align-items: center;
          min-height: ${DAILY_AVATAR_SIZE}px;
          margin: 0 0 20px;
        }
        .zhihu-content .meta .avatar {
          box-sizing: border-box;
          flex: 0 0 ${DAILY_AVATAR_SIZE}px;
          width: ${DAILY_AVATAR_SIZE}px !important;
          height: ${DAILY_AVATAR_SIZE}px !important;
          max-width: none;
          margin: 0 10px 0 0;
          border-radius: 50%;
          object-fit: cover;
        }
        .zhihu-content .meta .author {
          flex: 0 0 auto;
          font-size: 15px;
          font-weight: 600;
        }
        .zhihu-content .meta .bio {
          flex: 1 1 auto;
          min-width: 0;
          color: ${themeColors.textSecondary};
          font-size: 14px;
        }
        .zhihu-content .question-title:empty {
          display: none;
        }
      `
      : '';

  const html = `
    <!DOCTYPE html>
    <html lang="zh-Hans">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>${katexStyle.css}</style>
      <script>${katexRuntime.script.replace(/<\/script/gi, '<\\/script')}</script>
      <script>${katexRuntime.autoRender.replace(/<\/script/gi, '<\\/script')}</script>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: transparent !important;
          max-width: 100%;
          overflow-x: hidden;
          -webkit-user-select: text;
          user-select: text;
        }
        .zhihu-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
          color: ${textColor};
          max-width: 100%;
          word-break: normal;
          line-break: ${typographyOptions?.lineBreak ?? 'auto'};
          overflow-wrap: break-word;
          text-align: ${typographyOptions?.justify ? 'justify' : 'start'};
          text-align-last: start;
          ${typographyOptions?.autoSpacing ? 'text-autospace: ideograph-alpha ideograph-numeric;' : ''}
          ${typographyOptions?.trimPunctuation ? 'text-spacing-trim: trim-both;' : ''}
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
          font-size: ${metrics.codeFontSize}px;
          text-align: start;
          text-autospace: no-autospace;
        }
        .highlight {
          background-color: ${themeColors.backgroundSecondary};
          padding: 12px;
          border-radius: 8px;
          margin: 15px 0;
          border: 1px solid ${themeColors.border};
        }
        .zhihu-content p {
          margin: 0 0 ${RICH_CONTENT_PARAGRAPH_SPACING}px;
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
          color: ${themeColors.iconMuted};
          font-size: ${metrics.captionFontSize}px;
          margin-top: 8px;
          font-style: italic;
          text-align: center;
        }
        .zhihu-content a {
          color: ${primaryColor};
          text-decoration: none;
        }
        .zhihu-content a.zhihu-link-card {
          display: block;
          box-sizing: border-box;
          max-width: 100%;
          overflow: hidden;
          margin: 16px 0;
          padding: 14px 16px;
          border: 1px solid ${themeColors.contentBorderStrong};
          border-radius: ${radii.md}px;
          background: ${themeColors.backgroundTertiary};
          color: ${textColor};
        }
        .zhihu-link-card-title {
          color: ${textColor};
          font-size: ${typography.fontSize.bodyLarge}px;
          font-weight: 600;
          line-height: ${typography.lineHeight.compact};
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
          word-break: break-word;
        }
        .zhihu-link-card-desc {
          margin-top: 4px;
          color: ${themeColors.textSecondary};
          font-size: ${typography.fontSize.caption}px;
          line-height: ${typography.lineHeight.compact};
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          overflow: hidden;
          word-break: break-word;
        }
        .zhihu-content a.zhihu-link-card img.zhihu-link-card-image {
          display: block;
          width: 100%;
          height: 120px !important;
          max-height: 120px;
          object-fit: cover;
          margin-top: 10px;
          border-radius: ${radii.sm}px;
        }
        .zhihu-content blockquote {
          border-left: 4px solid ${primaryColor};
          padding-left: 18px;
          background-color: transparent;
          padding: 12px 18px;
          margin: 15px 0;
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
          color: ${themeColors.textSecondary};
        }
        .zhihu-content blockquote p {
          color: ${themeColors.textSecondary};
          font-size: ${metrics.body.fontSize}px;
          line-height: ${metrics.body.lineHeight}px;
        }
        .zhihu-content h1, .zhihu-content h2, .zhihu-content h3, .zhihu-content h4, .zhihu-content h5, .zhihu-content h6 { color: ${textColor}; text-align: start; }
        ${headingStyles}
        .zhihu-content ul, .zhihu-content ol { padding-left: 20px; margin: 10px 0; }
        .zhihu-content li { margin-bottom: ${RICH_CONTENT_LIST_ITEM_SPACING}px; font-size: ${metrics.body.fontSize}px; line-height: ${metrics.body.lineHeight}px; }
        .zhihu-content hr { height: 1px; background-color: ${themeColors.contentBorder}; border: none; margin: 25px 0; }
        ${dailyStyles}

        .segment-interactable {
          text-decoration: underline dashed;
          text-decoration-style: dashed;
          text-decoration-color: ${primaryColor}40;
          cursor: pointer;
        }
        .segment-liked {
          text-decoration: underline dashed;
          text-decoration-style: dashed;
          text-decoration-color: ${primaryColor}60;
        }
      </style>
    </head>
    <body>
      <div id="content" class="zhihu-content"></div>
      <script>
        const htmlContent = ${serializeInlineScriptValue(safeHtmlContent)};
        const segmentInfosStr = ${serializeInlineScriptValue(segmentInfosStr || '[]')};
        const linkCardInfoStr = ${serializeInlineScriptValue(linkCardInfoStr || '{}')};

        const container = document.getElementById('content');
        container.innerHTML = htmlContent;

        function getLinkCardInfo(href) {
          let info;
          try {
            info = JSON.parse(linkCardInfoStr);
          } catch (_) {
            return null;
          }
          const value = info && info[href];
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch (_) {
              return null;
            }
          }
          return value && typeof value === 'object' ? value : null;
        }

        function getImageUrl(value) {
          if (typeof value !== 'string') return '';
          const candidate = value.trim();
          if (!/^(https?:)?\\/\\//i.test(candidate)) return '';
          try {
            const url = new URL(candidate.indexOf('//') === 0 ? 'https:' + candidate : candidate);
            return !url.username && !url.password && /^(https?:)$/.test(url.protocol) ? url.href : '';
          } catch (_) {
            return '';
          }
        }

        function getLinkCardImage(display) {
          if (!display) return '';
          const content = display.content;
          const directImage = getImageUrl(display.image_url) || getImageUrl(display.cover_url) || getImageUrl(display.thumbnail);
          if (directImage) return directImage;
          if (!content || typeof content !== 'object') return '';
          return getImageUrl(content.image_url) || getImageUrl(content.cover_url) || getImageUrl(content.thumbnail) || getImageUrl(content.url) || getImageUrl(content.src) || '';
        }

        function getCardText(value) {
          if (typeof value !== 'string') return '';
          const element = document.createElement('template');
          element.innerHTML = value;
          return (element.content.textContent || '').trim();
        }

        // Zhihu stores link cards as editor-only anchors. Turn them into
        // visible cards before layout while keeping the anchor for clicks.
        container.querySelectorAll('a[data-draft-type="link-card"], a.LinkCard').forEach((anchor) => {
          const href = anchor.getAttribute('href') || '';
          const info = getLinkCardInfo(href);
          const display = info && info.display && typeof info.display === 'object' ? info.display : {};
          const cardHref = typeof display.card_open_url === 'string' ? display.card_open_url : href;
          const title = getCardText(display.title) || (anchor.textContent || '').trim() || href;
          const desc = getCardText(display.desc);
          const card = document.createElement('a');
          card.href = cardHref;
          card.className = 'zhihu-link-card';
          card.setAttribute('data-link-card-url', cardHref);

          const titleNode = document.createElement('div');
          titleNode.className = 'zhihu-link-card-title';
          titleNode.textContent = title;
          card.appendChild(titleNode);

          if (desc) {
            const descNode = document.createElement('div');
            descNode.className = 'zhihu-link-card-desc';
            descNode.textContent = desc;
            card.appendChild(descNode);
          }

          const image = getLinkCardImage(display) || getImageUrl(anchor.getAttribute('data-draft-cover'));
          if (image) {
            const imageNode = document.createElement('img');
            imageNode.className = 'zhihu-link-card-image';
            imageNode.src = image;
            imageNode.alt = '';
            card.appendChild(imageNode);
          }
          anchor.replaceWith(card);
        });

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
            const originalToken = img.getAttribute('data-original-token');
            let actualSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || src;

            if (actualSrc && originalToken) {
              const cleanToken = originalToken.trim();
              const tokenRegex = /v2-[a-fA-F0-9]{32}/;
              if (tokenRegex.test(actualSrc)) {
                actualSrc = actualSrc.replace(tokenRegex, cleanToken);
              }
            }

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
        } catch (_) {
          // Invalid optional metadata cannot block layout or reveal its contents.
        }

        // Process footnotes
        try {
          const footnotes = container.querySelectorAll('sup[data-text]');
          if (footnotes.length > 0) {
            const footnoteList = document.createElement('div');
            footnoteList.style.marginTop = '40px';
            footnoteList.style.borderTop = '1px solid ${themeColors.contentBorder}';
            footnoteList.style.paddingTop = '15px';
            footnoteList.style.fontSize = '14px';

            const title = document.createElement('h4');
            title.innerText = '注脚';
            title.style.margin = '0 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '${textColor}';
            footnoteList.appendChild(title);

            footnotes.forEach((sup) => {
              const text = sup.getAttribute('data-text');
              const numero = sup.getAttribute('data-numero') || sup.innerText.replace('[', '').replace(']', '');

              const footnoteId = 'footnote-' + numero;
              const refId = 'ref-' + numero;
              sup.id = refId;

              const item = document.createElement('div');
              item.id = footnoteId;
              item.style.marginBottom = '8px';
              item.style.lineHeight = '1.5';
              item.style.color = '${themeColors.textSecondary}';

              const backlink = document.createElement('a');
              backlink.href = '#' + refId;
              backlink.style.color = '${primaryColor}';
              backlink.style.fontWeight = 'bold';
              backlink.textContent = '[' + numero + ']';
              item.appendChild(backlink);
              item.appendChild(document.createTextNode(' ' + (text || '')));

              footnoteList.appendChild(item);

              const reference = document.createElement('a');
              reference.href = '#' + footnoteId;
              reference.style.color = '${primaryColor}';
              reference.textContent = '[' + numero + ']';
              sup.replaceChildren(reference);
            });

            container.appendChild(footnoteList);
          }
        } catch (_) {
          // Invalid optional footnotes cannot block the surrounding content.
        }

        // Render Math
        if (typeof renderMathInElement === 'function') {
          try {
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
          } catch (_) {
            // CDN or formula failures keep text, interactions and height reporting available.
          }
        }

        // Click and touch long-press handlers
        var imageTouchTimer = null;
        var imageTouchStart = null;
        var isLongPress = false;
        var imageLongPressMoveTolerance = 10;

        function clearImageLongPress() {
          if (imageTouchTimer) {
            clearTimeout(imageTouchTimer);
            imageTouchTimer = null;
          }
          imageTouchStart = null;
        }

        function findTrackedTouch(touchList) {
          if (!imageTouchStart) return null;
          for (var i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === imageTouchStart.identifier) {
              return touchList[i];
            }
          }
          return null;
        }

        container.addEventListener('touchstart', function(e) {
          clearImageLongPress();
          isLongPress = false;
          if (e.touches.length !== 1) return;

          var target = e.target;
          while (target && target !== container) {
            if (target.tagName === 'IMG') {
              var src = target.getAttribute('src');
              if (src) {
                var touch = e.touches[0];
                imageTouchStart = {
                  identifier: touch.identifier,
                  x: touch.clientX,
                  y: touch.clientY,
                };
                imageTouchTimer = setTimeout(function() {
                  if (!imageTouchStart) return;
                  imageTouchTimer = null;
                  isLongPress = true;
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'image_long_press', src: src }));
                }, 450);
              }
              break;
            }
            target = target.parentElement;
          }
        }, { passive: true });

        window.addEventListener('touchmove', function(e) {
          if (!imageTouchStart) return;
          if (e.touches.length !== 1) {
            clearImageLongPress();
            return;
          }

          var touch = findTrackedTouch(e.touches);
          if (!touch) {
            clearImageLongPress();
            return;
          }

          var deltaX = touch.clientX - imageTouchStart.x;
          var deltaY = touch.clientY - imageTouchStart.y;
          if (
            deltaX * deltaX + deltaY * deltaY >
            imageLongPressMoveTolerance * imageLongPressMoveTolerance
          ) {
            clearImageLongPress();
          }
        }, { passive: true, capture: true });

        window.addEventListener('touchend', clearImageLongPress, { passive: true, capture: true });
        window.addEventListener('touchcancel', clearImageLongPress, { passive: true, capture: true });

        container.addEventListener('click', function(e) {
          if (isLongPress) {
            isLongPress = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          let target = e.target;
          let cardTarget = target;
          while (cardTarget && cardTarget !== container) {
            if (
              cardTarget.tagName === 'A' &&
              cardTarget.classList.contains('zhihu-link-card')
            ) {
              e.preventDefault();
              const href = cardTarget.getAttribute('data-link-card-url') || cardTarget.getAttribute('href');
              if (href) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link', href }));
              }
              return;
            }
            cardTarget = cardTarget.parentElement;
          }
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

        // Text selection detection
        function findParagraph(node) {
          while (node && node !== container) {
            if (node.nodeType === 1 && node.getAttribute && node.getAttribute('data-pid')) {
              return node;
            }
            node = node.parentElement || node.parentNode;
          }
          return null;
        }

        function getTextOffset(paragraph, targetNode, targetOffset) {
          // DOM selections may end at an element's child boundary as well as
          // inside a text node. Range handles both in the same UTF-16 space.
          var prefix = document.createRange();
          prefix.selectNodeContents(paragraph);
          prefix.setEnd(targetNode, targetOffset);
          return prefix.toString().length;
        }

        var selectionTimeout;
        document.addEventListener('selectionchange', function() {
          clearTimeout(selectionTimeout);
          selectionTimeout = setTimeout(function() {
            var selection = window.getSelection();
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', info: null }));
              return;
            }
            var text = selection.toString();
            var range = selection.getRangeAt(0);
            var startP = findParagraph(range.startContainer);
            var endP = findParagraph(range.endContainer);
            if (startP && endP) {
              var startPid = startP.getAttribute('data-pid');
              var endPid = endP.getAttribute('data-pid');
              var sOff = getTextOffset(startP, range.startContainer, range.startOffset);
              var eOff = getTextOffset(endP, range.endContainer, range.endOffset);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'selection',
                info: {
                  text: text,
                  startParagraphId: startPid,
                  endParagraphId: endPid,
                  startOffset: sOff,
                  endOffset: eOff
                }
              }));
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', info: null }));
            }
          }, 300);
        });

        // Send height
        function updateTextMeasure() {
          if (!${Boolean(typographyOptions?.integerMeasure)}) return;
          var em = parseFloat(window.getComputedStyle(container).fontSize);
          var available = container.clientWidth;
          if (!(em > 0 && available > 0)) return;
          var measure = Math.max(em, Math.floor(available / em) * em);
          // Keep media full width; narrow only top-level text containers.
          Array.from(container.children).forEach(function(node) {
            if (/^(P|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(node.tagName)) {
              node.style.boxSizing = 'border-box';
              node.style.width = measure + 'px';
              node.style.marginLeft = 'auto';
              node.style.marginRight = 'auto';
            }
          });
        }

        function sendHeight() {
          updateTextMeasure();
          const height = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight,
            container.scrollHeight
          );
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height }));
        }

        // Font face completion can follow math insertion; measure its final metrics.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(sendHeight);
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

  // WebView treats a newly-created source object as a new document. Keep it
  // stable when a parent re-renders without changing the HTML string.
  const source = useMemo(() => ({ html }), [html]);

  return (
    <View style={[{ width: '100%', height }, style]}>
      <WebView
        source={source}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onMessage={(event) => {
          const data = parseRichContentBridgeMessage(event.nativeEvent.data);
          if (!data) return;

          switch (data.type) {
            case 'height':
              setHeight(data.height);
              onReady?.();
              break;
            case 'image':
              {
                const src = getSafeRichContentUrl(data.src, true);
                if (src) onImagePress(src);
              }
              break;
            case 'image_long_press':
              {
                const src = getSafeRichContentUrl(data.src, true);
                if (src) onImageLongPress?.(src);
              }
              break;
            case 'link':
              {
                const href = getSafeRichContentUrl(data.href);
                if (href) onLinkPress(href);
              }
              break;
            case 'segment':
              onSegmentPress(data.pid);
              break;
            case 'selection':
              onTextSelected?.(data.info);
              break;
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (
            request.url === 'about:blank' ||
            request.url.startsWith('about:blank#')
          )
            return true;
          const href = getSafeRichContentUrl(request.url);
          if (href) onLinkPress(href);
          return false;
        }}
      />
    </View>
  );
});
