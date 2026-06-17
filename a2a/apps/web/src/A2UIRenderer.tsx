export type A2UIPart =
  | { type: "text"; text: string }
  | { type: "data"; data: Record<string, unknown> };

export interface A2UIRendererProps {
  title: string;
  parts: A2UIPart[];
}

export function A2UIRenderer({ title, parts }: A2UIRendererProps) {
  return (
    <section>
      <h2>{title}</h2>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <p key={index}>{part.text}</p>;
        }

        return (
          <pre key={index}>
            {JSON.stringify(part.data, null, 2)}
          </pre>
        );
      })}
    </section>
  );
}
