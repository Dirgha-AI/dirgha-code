import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, margin: 0 }}>Hello, Dirgha 👋</h1>
      <p style={{ color: '#666', marginTop: 8 }}>
        Scaffolded by <code>dirgha scaffold</code>. Edit <code>src/App.tsx</code> and the page reloads.
      </p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{ padding: '8px 16px', fontSize: 16, cursor: 'pointer', borderRadius: 6, border: '1px solid #888', background: 'white' }}
      >
        clicked {count} times
      </button>
      <hr style={{ margin: '32px 0', border: 0, borderTop: '1px solid #eee' }} />
      <p style={{ color: '#888', fontSize: 14 }}>
        Iterate with{' '}
        <code>dirgha ask "make this a todo app with persistent storage"</code>.
      </p>
    </div>
  );
}
