import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Streamdown } from 'streamdown';

let notify = null;

function StreamingPanel() {
  const [text, setText] = useState('');
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    notify = (opts) => {
      setText(opts.text);
      setAnimating(opts.animating);
    };
    return () => {
      notify = null;
    };
  }, []);

  return (
    <Streamdown
      caret="block"
      isAnimating={animating}
      mode="streaming"
      parseIncompleteMarkdown
    >
      {text}
    </Streamdown>
  );
}

/** Mount [Streamdown](https://streamdown.ai) for live AI markdown streaming */
export function mountAiStreamPanel(container) {
  const root = createRoot(container);
  root.render(<StreamingPanel />);

  return {
    update(text, animating) {
      notify?.({ text, animating });
      requestAnimationFrame(() => {
        const wrap = container.closest('.ai-panel-stream');
        if (wrap) wrap.scrollTop = wrap.scrollHeight;
      });
    },
    unmount() {
      root.unmount();
    },
  };
}
