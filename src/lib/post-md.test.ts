import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptFromMarkdown, parseMarkdownFile, readingMinutes, readingMinutesFromChars } from "./post-md.ts";

test("parseMarkdownFile front matter alanlarını okur ve içerikten ayırır", () => {
  const p = parseMarkdownFile('---\ntitle: "Merhaba Dünya"\nexcerpt: Kısa özet\nauthor: Ayşe\ntype: news\ndate: 2026-10-05\n---\n\nİlk paragraf.\n');
  assert.equal(p.title, "Merhaba Dünya");
  assert.equal(p.excerpt, "Kısa özet");
  assert.equal(p.author, "Ayşe");
  assert.equal(p.type, "news");
  assert.equal(p.publishedAt, "2026-10-05T09:00");
  assert.equal(p.content, "İlk paragraf.\n");
});

test("parseMarkdownFile başlık yoksa ilk # satırını başlık yapar ve çıkarır", () => {
  const p = parseMarkdownFile("# Sertifika Rehberi\n\nGövde **kalın**.\n\n## Alt başlık\n");
  assert.equal(p.title, "Sertifika Rehberi");
  assert.equal(p.type, null);
  assert.equal(p.publishedAt, null);
  assert.equal(p.content, "Gövde **kalın**.\n\n## Alt başlık\n");
});

test("parseMarkdownFile CRLF, BOM ve front matter'sız metni kaldırır", () => {
  const p = parseMarkdownFile("﻿---\r\ntitle: A\r\ndate: 2026-01-02 14:30\r\n---\r\nmetin\r\n");
  assert.equal(p.title, "A");
  assert.equal(p.publishedAt, "2026-01-02T14:30");
  assert.equal(p.content, "metin\n");
  const plain = parseMarkdownFile("sadece metin");
  assert.equal(plain.title, "");
  assert.equal(plain.content, "sadece metin\n");
});

test("excerptFromMarkdown sözdizimini ayıklar ve kelime sınırında keser", () => {
  assert.equal(excerptFromMarkdown("# Başlık\n\nBu **kalın** bir [bağlantı](https://x.com) ve ![r](/a.png) metin."), "Başlık Bu kalın bir bağlantı ve metin.");
  const long = "kelime ".repeat(60);
  const e = excerptFromMarkdown(long, 50);
  assert.ok(e.endsWith("…") && e.length <= 51 && !e.includes("kelim…"), e);
});

test("readingMinutes en az 1 dakika, ~200 kelime/dk", () => {
  assert.equal(readingMinutes("kısa"), 1);
  assert.equal(readingMinutes("kelime ".repeat(450)), 3);
  assert.equal(readingMinutesFromChars(0), 1);
  assert.equal(readingMinutesFromChars(2700), 3);
});
