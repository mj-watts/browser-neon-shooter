// Shared, piecewise-linear canyon edges: simulation and scenery stay registered.
const fract = (value) => value - Math.floor(value);
const hash = (index, phase) =>
  fract(Math.sin(index * 127.1 + phase * 311.7) * 43758.5453);
const segment = (y, spacing, phase) => {
  const point = y / spacing;
  const index = Math.floor(point);
  const t = fract(point);
  return (hash(index, phase) * (1 - t) + hash(index + 1, phase) * t) * 2 - 1;
};
export function canyonWall(y, phase) {
  return segment(y, 6, phase) * 0.045 + segment(y, 2, phase + 4) * 0.014;
}
export const canyonWallShader = `
  float wallHash(float index, float phase){return fract(sin(index*127.1+phase*311.7)*43758.5453);}
  float wallSegment(float y,float spacing,float phase){
    float point=y/spacing,index=floor(point);
    return mix(wallHash(index,phase),wallHash(index+1.,phase),fract(point))*2.-1.;
  }
  float wall(float y,float phase){return wallSegment(y,6.,phase)*.045+wallSegment(y,2.,phase+4.)*.014;}
`;
