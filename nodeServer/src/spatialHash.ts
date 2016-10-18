import { GLM } from 'gl-matrix'

type IVector3 = GLM.IArray;
type IQuaternion = GLM.IArray;

export interface ISpatialHash<T> {
  cellSize: number;
  cellCount: number;
  cells: Array<T[]>; // Of length cellCount 
}

// Modulo that works for negative numbers
function mod (n : number, m : number) : number {
  return ((n % m) + m) % m;
}

export function make<T> (cellSize : number, cellCount : number) : ISpatialHash<T> {
  return {
    cellSize: cellSize
  , cellCount: cellCount
  , cells: new Array<T[]>(cellCount)
  };
}

export function getHash<T> (position: IVector3, spatialHash : ISpatialHash<T>) : number {
  return mod(   (((position[0]/spatialHash.cellSize)|0) * 73856093 /*PRIME_1*/)
              ^ (((position[1]/spatialHash.cellSize)|0) * 67978301 /*PRIME_2*/)
              ^ (((position[2]/spatialHash.cellSize)|0) * 83492791 /*PRIME_3*/)
            , spatialHash.cellCount);
}

function getHashFromXYZInts<T> (x : number, y : number, z : number, spatialHash : ISpatialHash<T>) : number {
  return mod(   (x * 73856093 /*PRIME_1*/)
              ^ (y * 67978301 /*PRIME_2*/)
              ^ (z * 83492791 /*PRIME_3*/)
            , spatialHash.cellCount);
}

export function doesCellContainObj (cell: any[], obj: any) {
  for (let test of cell) {
    if (test === obj) {
      return true;
    }
  }
  return false;
}

export function cellForPosition<T> (position : IVector3, spatialHash : ISpatialHash<T>) : any[] {
  return spatialHash.cells[getHash(position, spatialHash)];
}

function cellForXYZInts<T> (x: number, y: number, z: number, spatialHash : ISpatialHash<T>) : any[] {
  return spatialHash.cells[getHashFromXYZInts(x, y, z, spatialHash)];
}

export function cellsSurroundingPosition<T> (position : IVector3, spatialHash : ISpatialHash<T>) : (T[])[] {
  const res = [];
  let px = position[0]|0;
  let py = position[1]|0;
  let pz = position[2]|0;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        res.push(cellForXYZInts(px+x, py+y, pz+z, spatialHash));
      }      
    } 
  }
  return res;
}

export function addToCell<T> (obj: any, position : IVector3, spatialHash : ISpatialHash<T>) {
  let cell = spatialHash.cells[getHash(position, spatialHash)];
  if (!doesCellContainObj(cell, obj)) {
    cell.push(obj);
  }
}

export function clearCells<T> (spatialHash : ISpatialHash<T>) {
  for (let cell of spatialHash.cells) {
    cell.length = 0;
  }
}