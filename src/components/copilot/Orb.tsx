/** TOSS Copilot's orb (styles in globals.css): light swirling inside a glass sphere. `busy` makes
 *  it spin faster while Copilot is working. */
export function Orb({ size = 56, busy = false, className }: { size?: number; busy?: boolean; className?: string }) {
  return (
    <span className={`orb ${className ?? ""}`} data-state={busy ? "busy" : "idle"} style={{ width: size, height: size, ["--orb" as string]: `${size}px` }} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
