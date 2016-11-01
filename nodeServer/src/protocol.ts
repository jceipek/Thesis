import { vec3 as Vec3, quat as Quat } from "gl-matrix"

type IVector3 = Vec3;
type IQuaternion = Quat;
type IColor = Uint8Array;

export const enum MESSAGE_TYPE {
  Unknown = -1,
  Position = 0X00,
  PositionRotation = 0X01,
  PositionRotationScaleModel = 0X02,
  PositionRotationScaleVisibleTintModel = 0X03,
  PositionRotationVelocityColor = 0X04,
  Segment = 0X05,
  SimulationTime = 0X06,
  ControllerAttachment = 0X07
}

export const enum GIZMO_VISUALS_FLAGS {
  None = 0X00,
  XAxis = 0X01,
  YAxis = 0X02,
  ZAxis = 0X04,
  XRing = 0X08,
  YRing = 0X10,
  ZRing = 0X20
}

export const enum CONTROLLER_ATTACHMENT_TYPE {
  NONE = 0X00,
  GRAB = 0X01,
  DELETE = 0X02
}

export const enum MODEL_TYPE {
  NONE = 0X00,
  HEADSET = 0X01,
  CONTROLLER_BASE = 0X02,
  CONTROLLER_ATTACHMENT_MARKER = 0X03,
  CONTROLLER_ATTACHMENT_POINTER = 0X04,
  CONTROLLER_ATTACHMENT_VACUUM = 0X05,
  CONTROLLER_ATTACHMENT_WRENCH = 0X06,
  OVEN = 0X07,
  OVEN_CANCEL_BUTTON = 0X08,
  OVEN_PROJECTION_SPACE = 0X09,
  OVEN_SINGLE_STEP_BACK_BUTTON = 0X0A,
  OVEN_SINGLE_STEP_FORWARD_BUTTON = 0X0B,
  CLOCK = 0X0C,
  CLOCK_FREEZE_STATE_BUTTON = 0X0D,
  CLOCK_PLAY_PAUSE_BUTTON = 0X0E,
  CLOCK_RESET_STATE_BUTTON = 0X0F,
  CLOCK_SINGLE_STEP_BUTTON = 0X10,
  CUBE = 0X11,
  SPHERE = 0X12,
  CYLINDER = 0X13,
  SHELF = 0X14,
  PEDESTAL = 0X15,
  CONTROLLER_ATTACHMENT_PLIERS = 0X16
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

export function fillBufferWithPositionRotationScaleModelMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, modelType : MODEL_TYPE, pos : IVector3, rot : IQuaternion, scale : IVector3) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeUInt16LE(modelType, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  offset = buf.writeFloatLE(rot[0], offset, true);
  offset = buf.writeFloatLE(rot[1], offset, true);
  offset = buf.writeFloatLE(rot[2], offset, true);
  offset = buf.writeFloatLE(rot[3], offset, true);
  offset = buf.writeFloatLE(scale[0], offset, true);
  offset = buf.writeFloatLE(scale[1], offset, true);
  offset = buf.writeFloatLE(scale[2], offset, true);
  return offset;
}

export function fillBufferWithPositionRotationScaleVisibleTintModelMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, objectId : number, modelType : MODEL_TYPE, pos : IVector3, rot : IQuaternion, scale : IVector3, visible : boolean, tint : IColor, gizmoVisuals : GIZMO_VISUALS_FLAGS) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeUInt16LE(modelType, offset, true);
  offset = buf.writeFloatLE(pos[0], offset, true);
  offset = buf.writeFloatLE(pos[1], offset, true);
  offset = buf.writeFloatLE(pos[2], offset, true);
  offset = buf.writeFloatLE(rot[0], offset, true);
  offset = buf.writeFloatLE(rot[1], offset, true);
  offset = buf.writeFloatLE(rot[2], offset, true);
  offset = buf.writeFloatLE(rot[3], offset, true);
  offset = buf.writeFloatLE(scale[0], offset, true);
  offset = buf.writeFloatLE(scale[1], offset, true);
  offset = buf.writeFloatLE(scale[2], offset, true);
  offset = buf.writeInt8(visible? 1 : 0, offset, true);
  offset = buf.writeUInt8(tint[0], offset, true);
  offset = buf.writeUInt8(tint[1], offset, true);
  offset = buf.writeUInt8(tint[2], offset, true);
  offset = buf.writeUInt8(tint[3], offset, true);
  offset = buf.writeInt8(gizmoVisuals, offset, true);
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

export function fillBufferWithSimulationTimeMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, time : number) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeFloatLE(time, offset, true);
  return offset;
}

export function fillBufferWithControllerAttachmentMsg (buf : Buffer, offset : number, messageType : MESSAGE_TYPE, sequenceNumber : number, controllerAttachments : Uint8Array) {
  offset = buf.writeInt8(messageType, offset, true);
  offset = buf.writeInt32LE(sequenceNumber, offset, true);
  offset = buf.writeInt8(controllerAttachments[0], offset, true);
  offset = buf.writeInt8(controllerAttachments[1], offset, true);
  return offset;
}

