import * as FS from 'fs'

interface IIdentifier {
  cs: string;
  js: string;
}

interface IField {
  ident: IIdentifier;
  customType: string;
}

interface IMessage {
  name: string;
  fields: IField[];
}

var typeLengths = {
  'Int8': 1
, 'Int32': 4
, 'UInt16': 2
, 'Float': 4
}

const TYPE_INFO = {
  'MessageType': {js: 'MESSAGE_TYPE', cs: 'MessageType', len: 1}
, 'ControllerAttachmentTypes': {js: 'Uint8Array', cs: 'ControllerAttachmentTypes', len: 2} // XXX(JULIAN): Doesn't work for a different number than 2 controllers
, 'ModelType': {js: 'MODEL_TYPE', cs: 'ModelType', len: 2}
, 'Float': {js: 'number', cs: 'float', len: 4}
, 'Int32': {js: 'number', cs: 'int', len: 4}
, 'UInt16': {js: 'number', cs: 'ushort', len: 2}
, 'Vector3': {js: 'IVector3', cs: 'Vector3', len: 4*3}
, 'Quaternion': {js: 'IQuaternion', cs: 'Quaternion', len: 4*4}
, 'Color': {js: 'IColor', cs: 'Color32', len: 4}
, 'Bool': {js: 'boolean', cs: 'bool', len: 1}
, 'GizmoVisuals': {js: 'GIZMO_VISUALS_FLAGS', cs: 'GizmoVisualsFlags', len: 1}
, '[Message]': {js: 'TODO', cs: 'TODO', len: null}
}

const MESSAGE_TYPE_IDENT = {cs: 'MessageType', js: 'messageType'}
const SEQUENCE_NUMBER_IDENT = {cs: 'SequenceNumber', js: 'sequenceNumber'}
const OBJECTID_IDENT = {cs: 'ObjectId', js: 'objectId'}
const POSITION_IDENT = {cs: 'Position', js: 'pos'}
const VELOCITY_IDENT = {cs: 'Velocity', js: 'vel'}
const DESTINATION_IDENT = {cs: 'Destination', js: 'dest'}
const ROTATION_IDENT = {cs: 'Rotation', js: 'rot'}
const COLOR_IDENT = {cs: 'Color', js: 'color'}
const TINT_IDENT = {cs: 'Tint', js: 'tint'}
const MODEL_TYPE_IDENT = {cs: 'ModelType', js: 'modelType'}
const SCALE_IDENT = {cs: 'Scale', js: 'scale'}
const VISIBLE_IDENT = {cs: 'Visible', js: 'visible'}
const TIME_IDENT = {cs: 'Time', js: 'time'}
const CONTROLLER_ATTACHMENT_IDENT = {cs: 'ControllerAttachments', js: 'controllerAttachments'}
const GIZMO_VISUALS_IDENT = {cs: 'GizmoVisuals', js: 'gizmoVisuals'}
const MESSAGE_LIST_IDENT = {cs: '[Message]', js: 'messages'}

const CONTROLLER_ATTACHMENT_TYPES = [
  {cs: 'None', js: 'NONE'}
, {cs: 'Grab', js: 'GRAB'}
, {cs: 'Delete', js: 'DELETE'}
];

const MODEL_TYPES = [
  {cs: 'None', js: 'NONE'}
, {cs: 'Headset', js: 'HEADSET'}
// CONTROLLER
, {cs: 'ControllerBase', js: 'CONTROLLER_BASE'}
, {cs: 'ControllerAttachment_Marker', js: 'CONTROLLER_ATTACHMENT_MARKER'}
, {cs: 'ControllerAttachment_Pointer', js: 'CONTROLLER_ATTACHMENT_POINTER'}
, {cs: 'ControllerAttachment_Vacuum', js: 'CONTROLLER_ATTACHMENT_VACUUM'}
, {cs: 'ControllerAttachment_Wrench', js: 'CONTROLLER_ATTACHMENT_WRENCH'}
// OVEN
, {cs: 'Oven', js: 'OVEN'}
, {cs: 'Oven_CancelButton', js: 'OVEN_CANCEL_BUTTON'}
, {cs: 'Oven_ProjectionSpace', js: 'OVEN_PROJECTION_SPACE'}
, {cs: 'Oven_SingleStepBackButton', js: 'OVEN_SINGLE_STEP_BACK_BUTTON'}
, {cs: 'Oven_SingleStepForwardButton', js: 'OVEN_SINGLE_STEP_FORWARD_BUTTON'}
// CLOCK
, {cs: 'Clock', js: 'CLOCK'}
, {cs: 'Clock_FreezeStateButton', js: 'CLOCK_FREEZE_STATE_BUTTON'}
, {cs: 'Clock_PlayPauseButton', js: 'CLOCK_PLAY_PAUSE_BUTTON'}
, {cs: 'Clock_ResetStateButton', js: 'CLOCK_RESET_STATE_BUTTON'}
, {cs: 'Clock_SingleStepButton', js: 'CLOCK_SINGLE_STEP_BUTTON'}
// PRIMITIVES
, {cs: 'Cube', js: 'CUBE'}
, {cs: 'Sphere', js: 'SPHERE'}
, {cs: 'Cylinder', js: 'CYLINDER'}
// SHELF
, {cs: 'Shelf', js: 'SHELF'}
, {cs: 'Pedestal', js: 'PEDESTAL'}

// MORE CONTROLLER STUFF
, {cs: 'ControllerAttachment_Pliers', js: 'CONTROLLER_ATTACHMENT_PLIERS'}
]

const GIZMO_VISUALS_FLAG_TYPES = [
  'None'
, 'XAxis'
, 'YAxis'
, 'ZAxis'
, 'XRing'
, 'YRing'
, 'ZRing'
]

const MESSAGES : IMessage[] = [
  { name: 'Position'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            ]
  }
, { name: 'PositionRotation'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            , {ident: ROTATION_IDENT, customType: 'Quaternion'}
            ]
  }
, { name: 'PositionRotationScaleModel'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: MODEL_TYPE_IDENT, customType: 'ModelType'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            , {ident: ROTATION_IDENT, customType: 'Quaternion'}
            , {ident: SCALE_IDENT, customType: 'Vector3'}
            ]
  }
, { name: 'PositionRotationScaleVisibleTintModel'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: MODEL_TYPE_IDENT, customType: 'ModelType'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            , {ident: ROTATION_IDENT, customType: 'Quaternion'}
            , {ident: SCALE_IDENT, customType: 'Vector3'}
            , {ident: VISIBLE_IDENT, customType: 'Bool'}
            , {ident: TINT_IDENT, customType: 'Color'}
            , {ident: GIZMO_VISUALS_IDENT, customType: 'GizmoVisuals'}
            ]
  }
, { name: 'PositionRotationVelocityColor'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            , {ident: ROTATION_IDENT, customType: 'Quaternion'}
            , {ident: VELOCITY_IDENT, customType: 'Vector3'}
            , {ident: COLOR_IDENT, customType: 'Color'}
            ]
  }
, { name: 'Segment'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: OBJECTID_IDENT, customType: 'UInt16'}
            , {ident: POSITION_IDENT, customType: 'Vector3'}
            , {ident: DESTINATION_IDENT, customType: 'Vector3'}
            , {ident: COLOR_IDENT, customType: 'Color'}
            ]
  }
, { name: 'SimulationTime'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: TIME_IDENT, customType: 'Float'}
            ]
  }
, { name: 'ControllerAttachment'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: CONTROLLER_ATTACHMENT_IDENT, customType: 'ControllerAttachmentTypes'}
            ]
  }
, { name: 'MultiMessage'
  , fields: [ {ident: MESSAGE_TYPE_IDENT, customType: 'MessageType'}
            , {ident: SEQUENCE_NUMBER_IDENT, customType: 'Int32'}
            // Rest of the message will be other messages!
            ]
  }
];

function jsWriteForType (type: string, identifier: string) {
  let output = "";
  switch (type) {
    case 'GizmoVisuals':
      output += `  offset = buf.writeInt8(${identifier}, offset, true);\n`
      break;
    case 'MessageType':
      output += `  offset = buf.writeInt8(${identifier}, offset, true);\n`
      break;
    case 'ControllerAttachmentTypes':
      output += `  offset = buf.writeInt8(${identifier}[0], offset, true);\n`
      output += `  offset = buf.writeInt8(${identifier}[1], offset, true);\n`
      break;
    case 'ModelType':
      output += `  offset = buf.writeUInt16LE(${identifier}, offset, true);\n`
      break;
    case 'Vector3':
      output += `  offset = buf.writeFloatLE(${identifier}[0], offset, true);\n` // x
      output += `  offset = buf.writeFloatLE(${identifier}[1], offset, true);\n` // y
      output += `  offset = buf.writeFloatLE(${identifier}[2], offset, true);\n` // z
      break;
    case 'Quaternion':
      output += `  offset = buf.writeFloatLE(${identifier}[0], offset, true);\n` // w
      output += `  offset = buf.writeFloatLE(${identifier}[1], offset, true);\n` // x
      output += `  offset = buf.writeFloatLE(${identifier}[2], offset, true);\n` // y
      output += `  offset = buf.writeFloatLE(${identifier}[3], offset, true);\n` // z
      break;
    case 'Color':
      output += `  offset = buf.writeUInt8(${identifier}[0], offset, true);\n` // x
      output += `  offset = buf.writeUInt8(${identifier}[1], offset, true);\n` // y
      output += `  offset = buf.writeUInt8(${identifier}[2], offset, true);\n` // z
      output += `  offset = buf.writeUInt8(${identifier}[3], offset, true);\n` // z
      break;
    case 'Bool':
      output += `  offset = buf.writeInt8(${identifier}? 1 : 0, offset, true);\n`
      break;
    default:
      output += `  offset = buf.write${type}LE(${identifier}, offset, true);\n`
      break;
  }

  return output;
}

function jsWriteForMessage (message: IMessage) {
  let output = `export function fillBufferWith${message.name}Msg (buf : Buffer, offset : number, ${message.fields.map((field) => `${field.ident.js} : ${TYPE_INFO[field.customType].js}`).join(', ')}) {\n`;
  for (let field of message.fields) {
    output += jsWriteForType(field.customType, field.ident.js);
  }
  output += "  return offset;\n";
  output += "}\n";
  return output;
}

function numHex(s) {
  var a = s.toString(16);
  if( (a.length % 2) > 0 ){ a = "0" + a; }
  return ('0x'+a).toUpperCase();
}

function jsCreateProtocolFromMessages (messages: IMessage[]) {
  let output = `import { vec3 as Vec3, quat as Quat } from "gl-matrix"\n\n`

  output += `export const MAX_MESSAGE_LENGTH = 1200;\n\n`;

  output += `type IVector3 = Vec3;\n`;
  output += `type IQuaternion = Quat;\n`;
  output += `type IColor = Uint8Array;\n\n`;

  output += "export const enum MESSAGE_TYPE {\n";
  output += "  Unknown = -1,\n";
  output += messages.map((message, index) => `  ${message.name} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";
  output += "export const MESSAGE_TYPE_TO_LENGTH = {};\n"
  output += messages.map((message, index) => `MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.${message.name}] = ${message.fields.reduce((acc, field) => acc+TYPE_INFO[field.customType].len, 0)};`).join('\n');
  output += "\n\n";

  output += "export const enum GIZMO_VISUALS_FLAGS {\n";
  output += GIZMO_VISUALS_FLAG_TYPES.map((flagName, index) => `  ${flagName} = ${numHex((index == 0? 0 : 1<<(index-1)))}`).join(',\n');
  output += "\n}\n\n";

  output += "export const enum CONTROLLER_ATTACHMENT_TYPE {\n";
  output += CONTROLLER_ATTACHMENT_TYPES.map((attachmentType, index) => `  ${attachmentType.js} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";

  output += "export const enum MODEL_TYPE {\n";
  output += MODEL_TYPES.map((modelTypes, index) => `  ${modelTypes.js} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";

  output += "export const ATTACHMENT_TYPE_TO_MODEL = {};\n"
  output += "ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.NONE] = MODEL_TYPE.NONE;\n"
  output += "ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.GRAB] = MODEL_TYPE.CONTROLLER_ATTACHMENT_PLIERS;\n"
  output += "ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.DELETE] = MODEL_TYPE.CONTROLLER_ATTACHMENT_VACUUM;\n\n"

  output += messages.map((message) => jsWriteForMessage(message)).join('\n')+'\n';

  return output;
}

function csReadForMessage (message: IMessage) {
  let output = `\tprivate static NetMessage Decode${message.name} (byte[] data, ref int offset) {\n`
  output += `\t\treturn new NetMessage { MessageType = MessageType.${message.name},\n`
  // Skip message type!!!
  output += message.fields.slice(1).map((field) => `\t\t                        ${field.ident.cs} = ${field.customType}FromBuff(data, ref offset)`).join(',\n');
  output += " };\n";
  output += "\t}\n";
  return output;
}

function csCreateProtocolFromMessages (messages: IMessage[]) {
  let output = "namespace Giverspace {\n";
  output += "using UnityEngine;\n\n";
  output += "using System;\n\n";

  output += "public enum MessageType {\n";
  output += "  Unknown = -1,\n";
  output += messages.map((message, index) => `  ${message.name} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";

  output += "[FlagsAttribute]\n";
  output += "public enum GizmoVisualsFlags : byte {\n";
  output += GIZMO_VISUALS_FLAG_TYPES.map((flagName, index) => `  ${flagName} = ${numHex((index == 0? 0 : 1<<(index-1)))}`).join(',\n');
  output += "\n}\n\n";

  output +=
`public struct ControllerAttachmentTypes {
\tpublic ControllerAttachmentType a;
\tpublic ControllerAttachmentType b;
\tpublic ControllerAttachmentTypes (ControllerAttachmentType a, ControllerAttachmentType b) {
\t\tthis.a = a;
\t\tthis.b = b;
\t}
}
`

  output += "public enum ControllerAttachmentType {\n";
  output += CONTROLLER_ATTACHMENT_TYPES.map((attachmentType, index) => `  ${attachmentType.cs} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";

  output += "public enum ModelType {\n";
  output += MODEL_TYPES.map((modelTypes, index) => `  ${modelTypes.cs} = ${numHex(index)}`).join(',\n');
  output += "\n}\n\n";

  function getIdentifiers (message : IMessage) {
    return message.fields.map((field) => TYPE_INFO[field.customType] !== undefined? [field.ident.cs, TYPE_INFO[field.customType].cs] : null);
  }
  let fieldIdentifiers = new Map(messages.reduce((acc, message) => {
    if (message !== null) {
      acc.push(...getIdentifiers(message));
    }
    return acc;
  }, []));
  output += "public struct NetMessage {\n";
  for (let [ident, type] of fieldIdentifiers) {
    output += `\tpublic ${type} ${ident};\n`
  }
  output +=
  `\tstatic MessageType MessageTypeFromBuff (byte[] data, ref int offset) {
  \t\tMessageType res = (MessageType)data[offset];
  \t\toffset += 1;
  \t\treturn res;
  \t}

  \tstatic GizmoVisualsFlags GizmoVisualsFromBuff (byte[] data, ref int offset) {
  \t\tGizmoVisualsFlags res = (GizmoVisualsFlags)data[offset];
  \t\toffset += 1;
  \t\treturn res;
  \t}

  \tstatic ControllerAttachmentTypes ControllerAttachmentTypesFromBuff (byte[] data, ref int offset) {
  \t\tControllerAttachmentType res0 = (ControllerAttachmentType)data[offset];
  \t\toffset += 1;
  \t\tControllerAttachmentType res1 = (ControllerAttachmentType)data[offset];
  \t\toffset += 1;
  \t\treturn new ControllerAttachmentTypes(res0, res1);
  \t}

  \tstatic ModelType ModelTypeFromBuff (byte[] data, ref int offset) {
  \t\tModelType res = (ModelType)UInt16FromBuff(data, ref offset);
  \t\treturn res;
  \t}

  \tstatic bool BoolFromBuff (byte[] data, ref int offset) {
  \t\tbool res = data[offset] == 0x01;
  \t\toffset += 1;
  \t\treturn res;
  \t}

  \tstatic float FloatFromBuff (byte[] data, ref int offset) {
  \t\tfloat res = System.BitConverter.ToSingle(data, offset);
  \t\toffset += 4;
  \t\treturn res;
  \t}

  \tstatic int Int32FromBuff (byte[] data, ref int offset) {
  \t\tint res = (data[offset+0] & 0xFF)
  \t\t        | ((data[offset+1] & 0xFF) << 8) 
  \t\t        | ((data[offset+2] & 0xFF) << 16) 
  \t\t        | ((data[offset+3] & 0xFF) << 24);
  \t\toffset += 4;
  \t\treturn res;
  \t}

  \tstatic ushort UInt16FromBuff (byte[] data, ref int offset) {
  \t\tushort res = System.BitConverter.ToUInt16(data, offset);
  \t\toffset += 2;
  \t\treturn res;
  \t}

  \tstatic Vector3 Vector3FromBuff (byte[] data, ref int offset) {
  \t\tfloat x = FloatFromBuff(data, ref offset);
  \t\tfloat y = FloatFromBuff(data, ref offset);
  \t\tfloat z = FloatFromBuff(data, ref offset);
  \t\treturn new Vector3(x, y, z);
  \t}

  \tstatic Color32 ColorFromBuff (byte[] data, ref int offset) {
  \t\tbyte r = data[offset];
  \t\tbyte g = data[offset+1];
  \t\tbyte b = data[offset+2];
  \t\tbyte a = data[offset+3];
  \t\toffset += 4;
  \t\treturn new Color32(r,g,b,a);
  \t}

  \tstatic Quaternion QuaternionFromBuff (byte[] data, ref int offset) {
  \t\tfloat x = FloatFromBuff(data, ref offset);
  \t\tfloat y = FloatFromBuff(data, ref offset);
  \t\tfloat z = FloatFromBuff(data, ref offset);
  \t\tfloat w = FloatFromBuff(data, ref offset);
  \t\treturn new Quaternion(x, y, z, w);
  \t}\n\n`;

  output += messages.map((message) => csReadForMessage(message)).join('\n')+'\n';

  output += `\tpublic static bool DecodeMessage (byte[] buffer, int messageLength, out NetMessage decodedMessage) {\n`;
  output += `\t\tif (messageLength > 0) {\n`;
  output += `\t\t\tint offset = 0;\n`;
  output += `\t\t\tvar messageType = MessageTypeFromBuff(buffer, ref offset);\n`;
  output += `\t\t\tswitch (messageType) {`;
  
  output += messages.map((message) => `
  \t\t\t\tcase MessageType.${message.name}:
  \t\t\t\t\tif (messageLength == ${message.fields.reduce((acc, field) => acc+TYPE_INFO[field.customType].len, 0)}) {
  \t\t\t\t\t\tdecodedMessage = Decode${message.name}(buffer, ref offset);
  \t\t\t\t\t\treturn true;
  \t\t\t\t\t}
  \t\t\t\t\tbreak;`).join('');

  output += `\n\t\t\t\tdefault:\n`;
  output += `\t\t\t\t\tbreak;\n`;
  output += `\t\t\t}\n`;
  output += `\t\t}\n`;
  output += `\t\tdecodedMessage = new NetMessage { MessageType = MessageType.Unknown };\n`;
  output += `\t\treturn false;\n`;
  output += "\t}\n";
  output += "}\n";

  output += "\n}\n"; // namespace

  return output;
}


FS.writeFile("../../SyncDemo/Assets/Scripts/Networking/Protocol.cs"
            , csCreateProtocolFromMessages(MESSAGES)
            , (err) => {
              if(err) {
                return console.log(err);
              }
              console.log("Wrote CS Protocol");
});

FS.writeFile("../src/protocol.ts"
            , jsCreateProtocolFromMessages(MESSAGES)
            , (err) => {
              if(err) {
                return console.log(err);
              }
              console.log("Wrote JS Protocol");
});

// console.log(jsWriteForMessage(positionMessage));
// console.log(jsWriteForMessage(positionRotationMessage));
// console.log("-----------------------CS-----------------------");
// console.log(csReadForMessage(positionMessage));
// console.log("-----------------------CS-----------------------");
// console.log(csCreateProtocolFromMessages(MESSAGES));
// console.log("-----------------------JS-----------------------");
// console.log(jsCreateProtocolFromMessages(MESSAGES));