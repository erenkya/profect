import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs } from "./meeting-ics.ts";

const m = { id: 7, startsAt: "2026-12-03 14:00:00", endsAt: "2026-12-03 14:30:00", expertName: "Kaan Tunçbilek", meetingUrl: "https://meet.example.com/abc", attendeeEmail: "a@b.co", sequence: 0 };

test("temel VEVENT alanları", () => {
  const ics = buildIcs(m);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.includes("DTSTART;TZID=Europe/Istanbul:20261203T140000\r\n"));
  assert.ok(ics.includes("DTEND;TZID=Europe/Istanbul:20261203T143000\r\n"));
  assert.ok(ics.includes("UID:meeting-7@profect\r\n"));
  assert.ok(ics.includes("URL:https://meet.example.com/abc\r\n"));
  assert.ok(ics.includes("METHOD:REQUEST\r\n"));
  assert.ok(ics.includes("SEQUENCE:0\r\n"));
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
test("güncellemede SEQUENCE artar", () => assert.ok(buildIcs({ ...m, sequence: 2 }).includes("SEQUENCE:2\r\n")));
test("iptalde METHOD:CANCEL ve STATUS:CANCELLED", () => {
  const ics = buildIcs({ ...m, cancelled: true });
  assert.ok(ics.includes("METHOD:CANCEL\r\n") && ics.includes("STATUS:CANCELLED\r\n"));
});
test("75 oktetten uzun satırlar katlanır", () => {
  const ics = buildIcs({ ...m, meetingUrl: "https://meet.example.com/" + "x".repeat(200) });
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});
test("tüm satır sonları CRLF", () => assert.ok(!/[^\r]\n/.test(buildIcs(m))));
test("özel karakterler kaçışlanır", () => {
  const ics = buildIcs({ ...m, expertName: "A, B; C" });
  assert.ok(ics.includes("SUMMARY:Profect görüşmesi — A\\, B\; C"));
});
