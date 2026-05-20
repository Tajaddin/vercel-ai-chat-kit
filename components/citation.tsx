interface CitationsProps {
  citations: { title: string; snippet: string }[];
}

export function Citations({ citations }: CitationsProps) {
  return (
    <div className="citations" aria-label="Citations">
      {citations.map((c, i) => (
        <div key={`${c.title}-${i}`} id={`cite-${i + 1}`}>
          <strong>[{i + 1}]</strong> {c.title}: {c.snippet}
        </div>
      ))}
    </div>
  );
}
