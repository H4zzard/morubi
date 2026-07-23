// Marca única do Morubi — fonte única do logo do produto.
// Componente inline (sem depender de SVG-loader do bundler) para funcionar
// igual em Next.js (web) e Vite/WXT (extensão). Usa `currentColor`, então a cor
// vem do Tailwind (ex.: `text-brand-500`) em vez de ficar cravada aqui.
//
// Composição (pirâmide): losango superior + losango central com ponto central,
// "M" no meio, galho inferior e, dos dois lados, a aresta em escada com a grega
// em espiral. O lado direito é o esquerdo espelhado, então a simetria é
// garantida por construção.
//
// IMPORTANTE: as coordenadas aqui são as mesmas de
// `src/assets/logo-mark.svg` (usado para gerar favicon e os PNGs da extensão).
// Ao mexer em uma, mexa na outra.
import type { SVGProps } from "react";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinejoin: "miter",
  strokeLinecap: "butt",
} as const;

/** Ornamento lateral (aresta em escada + grega). Desenhado à esquerda e espelhado. */
function SideOrnament() {
  return (
    <>
      {/* Aresta em escada: forma a diagonal da pirâmide */}
      <path
        d="M38 548 L38 484 L86 484 L86 420 L134 420 L134 356 L182 356 L182 322"
        {...STROKE}
        strokeWidth={17}
      />
      {/* Grega em espiral dentro da asa */}
      <path
        d="M112 548 L112 466 L242 466 L242 548 L212 548 L212 506 L156 506 L156 548"
        {...STROKE}
        strokeWidth={17}
      />
      {/* Escadinha de pontos continuando a diagonal até o losango */}
      <rect x="198" y="292" width="19" height="19" />
      <circle cx="240" cy="272" r="9" />
    </>
  );
}

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 700 700"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Losango pequeno do topo */}
      <path
        d="M350 146 L392 190 L350 234 L308 190 Z M350 172 L368 190 L350 208 L332 190 Z"
        fillRule="evenodd"
      />
      <rect x="342" y="228" width="16" height="26" />
      {/* Losango central */}
      <path
        d="M350 246 L442 320 L350 400 L258 320 Z M350 286 L400 320 L350 358 L300 320 Z"
        fillRule="evenodd"
      />
      <circle cx="350" cy="320" r="25" />

      {/* "M" central */}
      <path d="M258 548 L258 390 L350 442 L442 390 L442 548" {...STROKE} strokeWidth={30} />
      {/* Galho inferior, aninhado sob o V */}
      <path d="M306 548 L350 500 L394 548" {...STROKE} strokeWidth={16} />

      {/* Ornamentos laterais: esquerdo + espelhado à direita */}
      <SideOrnament />
      <g transform="translate(700,0) scale(-1,1)">
        <SideOrnament />
      </g>
    </svg>
  );
}
