import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a className="font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" rel="noreferrer" target="_blank" {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="my-4 border-l-2 border-primary/40 pl-4 text-muted-foreground" {...props} />,
  code: ({ node: _node, className, ...props }) => <code className={className === undefined ? "rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]" : className} {...props} />,
  h1: ({ node: _node, ...props }) => <h1 className="mt-1 mb-5 font-heading text-2xl font-semibold tracking-tight" {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className="mt-8 mb-3 font-heading text-lg font-semibold tracking-tight" {...props} />,
  h3: ({ node: _node, ...props }) => <h3 className="mt-6 mb-2 font-heading text-base font-semibold" {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className="mt-5 mb-2 text-sm font-semibold" {...props} />,
  hr: ({ node: _node, ...props }) => <hr className="my-7 border-border" {...props} />,
  img: ({ node: _node, ...props }) => <img className="my-5 h-auto max-w-full rounded-md" {...props} />,
  li: ({ node: _node, ...props }) => <li className="pl-1 marker:text-muted-foreground" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-4 list-decimal space-y-1 pl-6 text-sm/7" {...props} />,
  p: ({ node: _node, ...props }) => <p className="my-3 text-sm/7 text-foreground/90" {...props} />,
  pre: ({ node: _node, ...props }) => <pre className="my-4 max-w-full overflow-x-auto overscroll-x-contain rounded-md bg-muted p-4 font-mono text-xs/5 whitespace-pre fade-x" {...props} />,
  table: ({ node: _node, ...props }) => <div className="my-5 min-w-0 max-w-full overflow-x-auto overscroll-x-contain fade-x"><table className="w-full min-w-[32rem] border-separate border-spacing-0 text-left text-xs" {...props} /></div>,
  td: ({ node: _node, ...props }) => <td className="border-b px-3 py-2 align-top" {...props} />,
  th: ({ node: _node, ...props }) => <th className="border-b px-3 py-2 font-semibold" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="my-4 list-disc space-y-1 pl-6 text-sm/7" {...props} />,
};

export function MarkdownPreview({ content }: { readonly content: string }) {
  return (
    <article className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 fade-y sm:px-7 sm:py-5">
      <div className="mx-auto w-full min-w-0 max-w-4xl">
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
