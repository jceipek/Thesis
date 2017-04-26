import { vec3 as Vec3, quat as Quat } from 'gl-matrix'
import * as DGRAM from 'dgram'
export const NETWORK = DGRAM.createSocket('udp4');
export const FPS = 90;
export const X_VECTOR3 = Vec3.fromValues(1,0,0);
export const Y_VECTOR3 = Vec3.fromValues(0,1,0);
export const Z_VECTOR3 = Vec3.fromValues(0,0,1);
export const UNIT_VECTOR3 = Vec3.fromValues(1,1,1);
export const NULL_VECTOR3 = Vec3.fromValues(0,0,0);
export const IDENT_QUAT = Quat.create();
export const BASE_COLOR = new Uint8Array([0xFF,0xFF,0xFF,0xFF]);
export const MAX_OBJECT_COUNT = 300;