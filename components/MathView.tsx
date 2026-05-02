'use dom';

import React from 'react';
import katex from 'katex';

interface MathViewProps {
  formula: string;
  displayMode?: boolean;
  colorScheme?: 'light' | 'dark';
}

export default function MathView({ formula, displayMode = false, colorScheme = 'light' }: MathViewProps) {
  const html = katex.renderToString(formula, {
    displayMode: displayMode,
    throwOnError: false,
    strict: false,
  });

  const textColor = colorScheme === 'dark' ? '#ffffff' : '#1a1a1a';

  return (
    <span style={{ 
      display: displayMode ? 'block' : 'inline-block',
      textAlign: displayMode ? 'center' : 'left'
    }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
      <span 
        dangerouslySetInnerHTML={{ __html: html }} 
        style={{ 
          fontSize: '17px', 
          color: textColor,
        }}
      />
    </span>
  );
}
