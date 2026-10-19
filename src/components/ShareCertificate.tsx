"use client";

import { Check, Link2, MessageCircle, Plus, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

// lucide marka ikonlarını içermiyor; yalnızca bu bileşende kullanılan sade glifler.
const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);
const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

type Props = {
  url: string;
  text: string;
  courseTitle: string;
  certificateCode: string;
  /** Sertifikanın veriliş yılı/ayı (LinkedIn "Sertifika ekle" formu için). */
  issueYear: number;
  issueMonth: number;
};

export function ShareCertificate({ url, text, courseTitle, certificateCode, issueYear, issueMonth }: Props) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const enc = encodeURIComponent;
  const links = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, icon: <LinkedInIcon /> },
    { label: "X", href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`, icon: <XIcon /> },
    { label: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${url}`)}`, icon: <MessageCircle size={18} aria-hidden /> },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, icon: <FacebookIcon /> },
  ];
  const linkedInProfile =
    `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${enc(courseTitle)}&organizationName=Profect` +
    `&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${enc(url)}&certId=${enc(certificateCode)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Bağlantıyı kopyala:", url);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: text, text, url });
    } catch {
      /* kullanıcı paylaşımı iptal etti */
    }
  }

  return (
    <section aria-label="Sertifikayı paylaş" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-55)", marginBottom: 12 }}>Başarını paylaş</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        {links.map((l) => (
          <a key={l.label} className="btn btn-secondary" href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`${l.label}’te paylaş`}>
            {l.icon} {l.label}
          </a>
        ))}
        <button type="button" className="btn btn-secondary" onClick={copy} aria-live="polite">
          {copied ? <Check size={18} aria-hidden /> : <Link2 size={18} aria-hidden />} {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
        </button>
        {canNativeShare && (
          <button type="button" className="btn btn-secondary" onClick={nativeShare}>
            <Share2 size={18} aria-hidden /> Paylaş…
          </button>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <a className="btn btn-ghost" href={linkedInProfile} target="_blank" rel="noopener noreferrer">
          <Plus size={16} aria-hidden /> LinkedIn profiline sertifika olarak ekle
        </a>
      </div>
    </section>
  );
}
