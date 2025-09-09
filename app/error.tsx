'use client';
import { useEffect } from 'react';

export default function Error({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page error (client):', { message: error.message, digest: (error as any).digest });
  }, [error]);

  return (
    <div>
      <h2>Ошибка страницы</h2>
      <p>Код (digest): {(error as any).digest ?? '—'}</p>
      <button onClick={() => reset()}>Повторить</button>
    </div>
  );
}
