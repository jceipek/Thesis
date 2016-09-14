import { vec3 as Vec3, quat as Quat, GLM } from "gl-matrix"

type IVector3 = GLM.IArray;
type IQuaternion = GLM.IArray;
type IColor = Uint8Array;

export const enum MESSAGE_TYPE {
  Unknown = -1,
  Position = 0X00,
  PositionRotation = 0X01,
  PositionRotationVelocityColor = 0X02,
  Segment = 0X03
}

export function fillBufferWithPositionMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, pos : IVector3) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  return offset;
}

export function fillBufferWithPositionRotationMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, pos : IVector3, rot : IQuaternion) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  offset = buf.writeFloatLE(rot[0], offset, true);
  offset = buf.writeFloatLE(rot[1], offset, true);
  offset = buf.writeFloatLE(rot[2], offset, true);
  offset = buf.writeFloatLE(rot[3], offset, true);
  return offset;
}

export function fillBufferWithPositionRotationVelocityColorMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, pos : IVector3, rot : IQuaternion, vel : IVector3, color : IColor) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  offset = buf.writeFloatLE(rot[0], offset, true);
  offset = buf.writeFloatLE(rot[1], offset, true);
  offset = buf.writeFloatLE(rot[2], offset, true);
  offset = buf.writeFloatLE(rot[3], offset, true);
  offset = buf.writeFloatLE(vel[0], offset, true);
  offset = buf.writeFloatLE(vel[1], offset, true);
  offset = buf.writeFloatLE(vel[2], offset, true);
  offset = buf.writeUInt8(color[0], offset, true);
  offset = buf.writeUInt8(color[1], offset, true);
  offset = buf.writeUInt8(color[2], offset, true);
  offset = buf.writeUInt8(color[3], offset, true);
  return offset;
}

export function fillBufferWithSegmentMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, pos : IVector3, dest : IVector3, color : IColor) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  offset = buf.writeFloatLE(dest[0], offset, true);
  offset = buf.writeFloatLE(dest[1], offset, true);
  offset = buf.writeFloatLE(dest[2], offset, true);
  offset = buf.writeUInt8(color[0], offset, true);
  offset = buf.writeUInt8(color[1], offset, true);
  offset = buf.writeUInt8(color[2], offset, true);
  offset = buf.writeUInt8(color[3], offset, true);
  return offset;
}

