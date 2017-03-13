import { MAX_MESSAGE_LENGTH, MESSAGE_TYPE, MESSAGE_TYPE_TO_LENGTH, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE, GIZMO_VISUALS_FLAGS, ATTACHMENT_TYPE_TO_MODEL } from './protocol'
import * as BPromise from 'bluebird'
import * as Protocol from './protocol'
import { vec3 as Vec3, quat as Quat } from 'gl-matrix'
import {
  IVector3
, IQuaternion
, IColor
, IState
, ITransientState
, IEntityList
, IEntity
, ISegment
, IInteractionVolume
, ISphereInteractionVolume
, IButtonState
, IHeadset
, IController
, IInputData
, IRule
, ICondition
, IConditionPresent
, IConditionIntersect
, IAlteration
, IControllerMetadata
, IAlterationMove
, IAlterationDelete
, IAction
, IActionWithEntity
, IActionMoveBy
, IActionDelete
, IOven
, IShelf
, IClock
, VOLUME_TYPE
, SIMULATION_TYPE
, CONDITION_TYPE
, ALTERATION_TYPE
, ACTION_TYPE
} from './interface'
import {
  NETWORK
, FPS
, X_VECTOR3
, Y_VECTOR3
, Z_VECTOR3
, UNIT_VECTOR3
, NULL_VECTOR3
, IDENT_QUAT
, BASE_COLOR
} from './constants'
import { PERFORMANCE_TRACKER, nanosecondsFromElapsedDelta } from './instrumentation'


let _currSeqId = 0;
const _sendBuffer = Buffer.allocUnsafe(131072);

const PORT = 8053;
// const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)
// const HOST = '169.254.255.255'; // Subnet broadcast
// const HOST = '192.168.1.255'; // Subnet broadcast
const HOST = '127.0.0.1';

function sendBroadcast (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  // console.log(`SBFrom ${0}:${messageLength}`)
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendTarget (message : Buffer, messageLength: number, host: string, port: number, callback : (err: any, bytes: number) => void) {
  // console.log(`STFrom ${0}:${messageLength}`)
  NETWORK.send(message, 0, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function doSend (message : Buffer, offset: number, messageLength: number, port: number, host: string, callback : (err: any, bytes: number) => void) {
  // console.log(`From ${offset}:${offset+messageLength}`)
  NETWORK.send(message, offset, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

const sendBroadcastPromise = BPromise.promisify(sendBroadcast);
const sendTargetPromise = BPromise.promisify(sendTarget);
const sendPromise = BPromise.promisify(doSend);

function packSendAvatarInfo (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, destination: string, inputData : IInputData) {
  let [host, portString] = destination.split(':');
  let port = parseInt(portString, 10);

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, port, host);
  Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, inputData.headset.id, MODEL_TYPE.HEADSET, inputData.headset.pos, inputData.headset.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];

  let controller0 = inputData.controllers[0];
  let controller1 = inputData.controllers[1];
  
  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, port, host);
  Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, controller0.id, MODEL_TYPE.CONTROLLER_BASE, controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, port, host);
  Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, controller1.id, MODEL_TYPE.CONTROLLER_BASE, controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, port, host);
  Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, controller0.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller0.attachment], controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, port, host);
  Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, controller1.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller1.attachment], controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];
}

function packEntityData (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, entity: IEntity) {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, entity.rot);
  let temp = Vec3.create();
  const pos = Vec3.add(/*out*/temp
                      , offsetpos, Vec3.transformQuat(/*out*/temp
                                                     , entity.pos, offsetrot));
  const scale = Vec3.mul(/*out*/Vec3.create()
                        , entity.scale, offsetscale);

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, PORT, HOST);
  let newOffset = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer
                                                                                 , descriptor.start + descriptor.length, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel
                                                                                 , entity.id
                                                                                 , entity.type
                                                                                 , pos
                                                                                 , rot
                                                                                 , scale
                                                                                 , entity.visible && !entity.deleted 
                                                                                 , entity.tint
                                                                                 , entity.gizmoVisuals);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.PositionRotationScaleVisibleTintModel];

  for (let child of entity.children.entities) {
      packEntityData(deferredPromises, descriptor, pos, rot, scale, child);
  }
}

function packEntity (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, entity : IEntity) {
  return packEntityData(deferredPromises, descriptor, NULL_VECTOR3, IDENT_QUAT, UNIT_VECTOR3, entity);
}

function packEntityList (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, entityList : IEntityList) {
  // TODO(JULIAN): Implement scale for entity lists and use it here
  for (let entity of entityList.entities) {
      packEntityData(deferredPromises, descriptor, entityList.offsetPos, entityList.offsetRot, UNIT_VECTOR3, entity);
  }
}

function packSendSegment (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, segment : ISegment) {
  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.Segment, PORT, HOST);
  Protocol.fillBufferWithSegmentMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.Segment, segment.id, segment.start, segment.end, segment.color);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.Segment];
}

const _controllerAttachmentsBuffer = new Uint8Array([CONTROLLER_ATTACHMENT_TYPE.NONE, CONTROLLER_ATTACHMENT_TYPE.NONE]); 
function asyncSendAttachment (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, destination: string, controllers : IController[]) {
  const [host, portString] = destination.split(':');
  const port = parseInt(portString, 10);
  _controllerAttachmentsBuffer[0] = controllers[0].attachment;
  _controllerAttachmentsBuffer[1] = controllers[1].attachment;

  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.ControllerAttachment, port, host);
  Protocol.fillBufferWithControllerAttachmentMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.ControllerAttachment, _controllerAttachmentsBuffer);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.ControllerAttachment];
}

function packSendSimulationTime (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, time : number) {
  fillMultiMessageBody(deferredPromises, descriptor, MESSAGE_TYPE.SimulationTime, PORT, HOST);
  Protocol.fillBufferWithSimulationTimeMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.SimulationTime, time);
  descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.SimulationTime];
}

function fillMultiMessageBody (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor, nextMessageType: MESSAGE_TYPE, port: number, host: string) {
  if (descriptor.length + MESSAGE_TYPE_TO_LENGTH[nextMessageType] > MAX_MESSAGE_LENGTH ||
     (descriptor.port !== port || descriptor.host !== host)) {
    prepareMultiMessagePromise(deferredPromises, descriptor);
  }
  if (descriptor.length === 0) {
    Protocol.fillBufferWithMultiMessageMsg(_sendBuffer, descriptor.start + descriptor.length, MESSAGE_TYPE.MultiMessage, _currSeqId);
    descriptor.length += MESSAGE_TYPE_TO_LENGTH[MESSAGE_TYPE.MultiMessage];
  }
  descriptor.port = port;
  descriptor.host = host;
}

function prepareMultiMessagePromise (deferredPromises : BPromise<number>[], descriptor: IMultiMesageDescriptor) {
  deferredPromises.push(sendPromise(_sendBuffer, descriptor.start, descriptor.length, descriptor.port, descriptor.host));
  _currSeqId++;
  descriptor.start += descriptor.length; 
  descriptor.length = 0;
}

interface IMultiMesageDescriptor {
  start: number;
  length: number;
  port: number;
  host: string;
}

let _finishedSending : boolean = true;
async function sendState (state : IState, transientState : ITransientState) {
  // console.log(">>>>>SEND");
  let DEBUG_start_sending = process.hrtime();
  let startFrame = PERFORMANCE_TRACKER.currFrame;

  let promises = [];
  let multiMessageDescriptor : IMultiMesageDescriptor = { start: 0, length: 0, port: PORT, host: HOST };

  packSendSimulationTime(promises, multiMessageDescriptor, state.simulationTime);
 
  for (let model of state.models.entities) {
    packEntity(promises, multiMessageDescriptor, model);
  }

  for (let entity of state.entities.entities) {
    packEntity(promises, multiMessageDescriptor, entity);
  }

  packEntityList(promises, multiMessageDescriptor, state.oven.currRuleEntities);
  packEntityList(promises, multiMessageDescriptor, state.recycleableEntities);

  let avatarStuffToSend = [];
  let controllerAttachmentDataToSend = [];
  for (let remoteClient of transientState.inputData.keys()) {
    for (let [client, inputData] of transientState.inputData) {
      if (remoteClient !== client) {
        avatarStuffToSend.push({destination: remoteClient, data: inputData})
      } else {
        controllerAttachmentDataToSend.push({destination: remoteClient, data: inputData.controllers});
      }
      avatarStuffToSend.push({destination: '127.0.0.1:'+PORT, data: inputData});
    }
  }

  let offset = multiMessageDescriptor.start + multiMessageDescriptor.length; 
  for (let destAndInputData of avatarStuffToSend) {
    packSendAvatarInfo(promises, multiMessageDescriptor, destAndInputData.destination, destAndInputData.data);
  }

  for (let destAndControllers of controllerAttachmentDataToSend) {
    asyncSendAttachment(promises, multiMessageDescriptor, destAndControllers.destination, destAndControllers.data);
  }

  for (let segment of state.segments) {
    packSendSegment(promises, multiMessageDescriptor, segment);
  }
  
  if (multiMessageDescriptor.length > 0) {
    prepareMultiMessagePromise(promises, multiMessageDescriptor);
  }

  PERFORMANCE_TRACKER[startFrame].preTransferTime = nanosecondsFromElapsedDelta(process.hrtime(DEBUG_start_sending));

  await BPromise.all(promises);

  PERFORMANCE_TRACKER[startFrame].transferTime = nanosecondsFromElapsedDelta(process.hrtime(DEBUG_start_sending)) - PERFORMANCE_TRACKER[startFrame].preTransferTime;

  // console.log(`Benchmark took ${diff[0] * 1e9 + diff[1]} nanoseconds`);

  // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;

  // let sending_elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
  // console.log(`{compute: ${compute_elapsed}, sending: ${sending_elapsed}}`);
  // console.log(`DBG>>${compute_elapsed}\t ${sending_elapsed}`);
  _finishedSending = true;

  // console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
}

let _framesDroppedPerSecond = 0;
let _frameCounter = 0;
export function tryTransferState (state : IState, transientState : ITransientState) {
  if (!_finishedSending) {
    _framesDroppedPerSecond++;      
  } else {
    _finishedSending = false;
    sendState(state, transientState);
  }

  _frameCounter++;
  if (_frameCounter >= FPS) {
    if (_framesDroppedPerSecond > 0) {
      console.log(`${_framesDroppedPerSecond} frames dropped per second!`);
      _framesDroppedPerSecond = 0;
    }
    _frameCounter = 0;
  }
}