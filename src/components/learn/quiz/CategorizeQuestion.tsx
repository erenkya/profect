"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { PublicQuestion } from "@/lib/quiz-model";

type Q = Extract<PublicQuestion, { kind: "categorize" }>;
type Props = { question: Q; value: Record<string, number> | undefined; onChange: (v: Record<string, number>) => void; disabled: boolean };
type Card = Q["cards"][number];

const POOL = "pool";

/**
 * Kartları kategorilere ayırma. Fareyle/dokunarak sürükle-bırak; ayrıca kartı seç → kategoriye (ya da havuza)
 * dokun ile yerleştirme (klavye ve küçük ekranlar için).
 */
export function CategorizeQuestion({ question: q, value, onChange, disabled }: Props) {
  const placed = value ?? {};
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  function move(cardId: number, target: string) {
    const next = { ...placed };
    if (target === POOL) delete next[String(cardId)];
    else next[String(cardId)] = Number(target);
    onChange(next);
    setSelected(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (e.over) move(Number(e.active.id), String(e.over.id));
  }

  const pool = q.cards.filter((c) => !(String(c.id) in placed));
  const zoneProps = { selected, disabled, onPlace: (target: string) => selected !== null && move(selected, target) };
  const cardProps = (c: Card) => ({ card: c, selected: selected === c.id, disabled, onSelect: () => setSelected((s) => (s === c.id ? null : c.id)) });

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(q.cards.find((c) => c.id === Number(e.active.id)) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <p className="quiz-multi-hint" role="status" style={{ marginBottom: 12 }}>
        <span>Kartları sürükleyip doğru kategoriye bırak ya da karta, sonra kategoriye dokun.</span>
        <span style={{ color: pool.length === 0 ? "var(--color-accent-700)" : "var(--muted-55)" }}>
          {q.cards.length - pool.length} / {q.cards.length} yerleştirildi
        </span>
      </p>

      <Zone id={POOL} title="Kartlar" variant="pool" {...zoneProps}>
        {pool.length ? pool.map((c) => <DraggableCard key={c.id} {...cardProps(c)} />) : <span className="quiz-zone-empty">Tüm kartlar yerleştirildi.</span>}
      </Zone>

      <div className="quiz-zones">
        {q.categories.map((cat) => {
          const cards = q.cards.filter((c) => placed[String(c.id)] === cat.id);
          return (
            <Zone key={cat.id} id={String(cat.id)} title={cat.name} {...zoneProps}>
              {cards.length ? cards.map((c) => <DraggableCard key={c.id} {...cardProps(c)} />) : <span className="quiz-zone-empty">Kartı buraya bırak</span>}
            </Zone>
          );
        })}
      </div>

      {/* Kopya body'ye çizilir: soru alanının transform animasyonu fixed konumu kaydırmasın. */}
      {typeof document !== "undefined" && createPortal(<DragOverlay dropAnimation={null}>{dragging && <div className="quiz-card" data-overlay>{dragging.text}</div>}</DragOverlay>, document.body)}
    </DndContext>
  );
}

function Zone({ id, title, variant, selected, disabled, onPlace, children }: { id: string; title: string; variant?: "pool"; selected: number | null; disabled: boolean; onPlace: (target: string) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  const canPlace = selected !== null && !disabled;
  return (
    <div ref={setNodeRef} className="quiz-zone" data-variant={variant} data-over={isOver || undefined} data-target={canPlace || undefined} onClick={() => canPlace && onPlace(id)}>
      <div className="quiz-zone-title">
        <span>{title}</span>
        {canPlace && (
          <button type="button" className="quiz-zone-place" onClick={(e) => { e.stopPropagation(); onPlace(id); }}>
            {variant === "pool" ? "Geri al" : "Buraya bırak"}
          </button>
        )}
      </div>
      <div className="quiz-zone-cards">{children}</div>
    </div>
  );
}

function DraggableCard({ card, selected, disabled, onSelect }: { card: Card; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: card.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="quiz-card"
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      disabled={disabled}
      {...attributes}
      {...listeners}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation(); // bölgenin "buraya bırak" tıklamasını tetiklemesin
        onSelect();
      }}
    >
      {card.text}
    </button>
  );
}
