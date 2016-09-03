export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export function sqrDistance3D (p1 : Vector3, p2 : Vector3) {
  var x = p1.x - p2.x;
  var y = p1.y - p2.y;
  var z = p1.z - p2.z;
  return (x*x + y*y + z*z);
}

export function distance3D (p1 : Vector3, p2 : Vector3) {
  return Math.sqrt(sqrDistance3D(p1,p2));
}

export function subtract3D (p1 : Vector3, p2 : Vector3) : Vector3 {
  return { x: p1.x-p2.x, y: p1.y-p2.y, z: p1.z-p2.z };
}

export function add3D (p1 : Vector3, p2 : Vector3) : Vector3 {
  return { x: p1.x+p2.x, y: p1.y+p2.y, z: p1.z+p2.z };
}

// import { Vector3, sqrDistance3D, distance3D, subtract3D, add3D }