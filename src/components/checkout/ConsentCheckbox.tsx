"use client";

import { LegalDialog } from "@/components/legal/LegalDialog";

/** "<bağlantı> okudum ve kabul ediyorum" onay kutusu; bağlantı metni açılır pencerede gösterir. */
export function ConsentCheckbox({ id, checked, onChange, linkText, suffix, title, children }: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  linkText: string;
  suffix: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} style={{ display: "flex", gap: 10, fontSize: 14, alignItems: "flex-start", cursor: "pointer" }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required style={{ marginTop: 3 }} />
      <span>
        <LegalDialog title={title} trigger={linkText}>{children}</LegalDialog>
        {suffix}
      </span>
    </label>
  );
}
