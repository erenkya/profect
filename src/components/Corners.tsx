/** `.blueprint` çerçevelerinin dört köşe işareti. */
export function Corners({ style }: { style?: React.CSSProperties }) {
  return (
    <>
      <i className="corner tl" style={style} />
      <i className="corner tr" style={style} />
      <i className="corner bl" style={style} />
      <i className="corner br" style={style} />
    </>
  );
}
