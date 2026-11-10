"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Something went wrong</h1>
      <p>The page could not be loaded.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
