// Computes evenly-spaced, distinct integer Y-axis tick values for the
// "Students by class level" bar chart, rather than relying on recharts'
// own auto-fit tick generation (allowDecimals={false} alone isn't
// enough — see docs/DECISIONS.md for the real bug this replaced: a
// negative chart margin pushed multi-digit tick labels outside the
// SVG's clipped viewBox, visually truncating them to their last digit).
// Pure function — no DOM/recharts involved — so it's directly unit
// testable without fighting jsdom's lack of real SVG layout.
export function computeIntegerTicks(maxValue: number, tickCount = 5): number[] {
  const safeMax = Math.max(maxValue, 1);
  const rawStep = safeMax / (tickCount - 1);
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const residual = rawStep / magnitude;

  let niceResidual: number;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;

  const step = Math.max(1, Math.round(niceResidual * magnitude));
  const ticks: number[] = [];
  for (let tick = 0; tick <= safeMax; tick += step) {
    ticks.push(tick);
  }
  // Guarantee the top tick is strictly above the highest bar, so the
  // tallest bar never touches the plot area's ceiling.
  if (ticks[ticks.length - 1] <= safeMax) {
    ticks.push(ticks[ticks.length - 1] + step);
  }
  return ticks;
}
