import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Blog/haber içeriği. Ham HTML işlenmez (rehype-raw yok); dış bağlantılar yeni sekmede açılır. */
export function PostMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" /> : null),
        a: ({ href, children: label }) => {
          const external = typeof href === "string" && /^https?:\/\//i.test(href);
          return <a href={href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>{label}</a>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
