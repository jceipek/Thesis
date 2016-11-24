import { MESSAGE_TYPE, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE, GIZMO_VISUALS_FLAGS, ATTACHMENT_TYPE_TO_MODEL } from './protocol'
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

async function asyncSendAvatarInfo (destination: string, inputData : IInputData) : Promise<number> {
  let dataCount = 0;
  let messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, inputData.headset.id, MODEL_TYPE.HEADSET, inputData.headset.pos, inputData.headset.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  let [host, portString] = destination.split(':');
  let port = parseInt(portString, 10);
  let controller0 = inputData.controllers[0];
  let controller1 = inputData.controllers[1];
  dataCount += await sendTargetPromise(_sendBuffer, messageLength, host, port);
  
  messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller0.id, MODEL_TYPE.CONTROLLER_BASE, controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  dataCount += await sendTargetPromise(_sendBuffer, messageLength, host, port);

  messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller1.id, MODEL_TYPE.CONTROLLER_BASE, controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  dataCount += await sendTargetPromise(_sendBuffer, messageLength, host, port);

  messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller0.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller0.attachment], controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  dataCount += await sendTargetPromise(_sendBuffer, messageLength, host, port);

  messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller1.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller1.attachment], controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  dataCount += await sendTargetPromise(_sendBuffer, messageLength, host, port);

  return dataCount;
}

function asyncSendEntityData (deferredPromises : BPromise<number>[], offset: number, offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, entity: IEntity) : number {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, entity.rot);
  let temp = Vec3.create();
  const pos = Vec3.add(/*out*/temp
                      , offsetpos, Vec3.transformQuat(/*out*/temp
                                                     , entity.pos, offsetrot));
  const scale = Vec3.mul(/*out*/Vec3.create()
                        , entity.scale, offsetscale);
  let newOffset = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer
                                                                                 , offset, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel
                                                                                 , _currSeqId
                                                                                 , entity.id
                                                                                 , entity.type
                                                                                 , pos
                                                                                 , rot
                                                                                 , scale
                                                                                 , entity.visible && !entity.deleted 
                                                                                 , entity.tint
                                                                                 , entity.gizmoVisuals);

  const messageLength = newOffset - offset;
  _currSeqId++;
  deferredPromises.push(sendPromise(_sendBuffer, offset, messageLength, PORT, HOST));
  for (let child of entity.children.entities) {
      newOffset = asyncSendEntityData(deferredPromises, newOffset, pos, rot, scale, child);
  }
  return newOffset;
}

function asyncSendEntity (deferredPromises : BPromise<number>[], offset: number, entity : IEntity) : number {
  return asyncSendEntityData(deferredPromises, offset, NULL_VECTOR3, IDENT_QUAT, UNIT_VECTOR3, entity);
}

function asyncSendEntityList (deferredPromises : BPromise<number>[], offset: number, entityList : IEntityList) : number {
  // TODO(JULIAN): Implement scale for entity lists and use it here
  let dataCount = 0;
  for (let entity of entityList.entities) {
      offset = asyncSendEntityData(deferredPromises, offset, entityList.offsetPos, entityList.offsetRot, UNIT_VECTOR3, entity);
  }
  return offset;
}

async function asyncSendSegment (offset: number, segment : ISegment) : Promise<number> {
  const newOffset = Protocol.fillBufferWithSegmentMsg(_sendBuffer, offset, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  const messageLength = newOffset - offset;
  // return sendPromise(_sendBuffer, offset, messageLength, PORT, HOST);
  return sendPromise(_sendBuffer, offset, messageLength, PORT, HOST);//sendBroadcastPromise(_sendBuffer, messageLength);
}

const _controllerAttachmentsBuffer = new Uint8Array([CONTROLLER_ATTACHMENT_TYPE.NONE, CONTROLLER_ATTACHMENT_TYPE.NONE]); 
async function asyncSendAttachment (destination: string, controllers : IController[]) : Promise<number> {
  const [host, portString] = destination.split(':');
  const port = parseInt(portString, 10);
  _controllerAttachmentsBuffer[0] = controllers[0].attachment;
  _controllerAttachmentsBuffer[1] = controllers[1].attachment;
  const messageLength = Protocol.fillBufferWithControllerAttachmentMsg(_sendBuffer, 0, MESSAGE_TYPE.ControllerAttachment, _currSeqId, _controllerAttachmentsBuffer); 
  _currSeqId++;
  return sendTargetPromise(_sendBuffer, messageLength, host, port);
}

function sendSimulationTime (deferredPromises : BPromise<number>[], offset: number, time : number) : number {
  const newOffset = Protocol.fillBufferWithSimulationTimeMsg(_sendBuffer, offset, MESSAGE_TYPE.SimulationTime, _currSeqId, time);
  const messageLength = newOffset - offset;
  _currSeqId++;
  deferredPromises.push(sendPromise(_sendBuffer, offset, messageLength, PORT, HOST));
  return newOffset;
}

let _finishedSending : boolean = true;
async function sendState (state : IState, transientState : ITransientState) {
  // console.log(">>>>>SEND");
  let DEBUG_start_sending = process.hrtime();
  let startFrame = PERFORMANCE_TRACKER.currFrame;

  let offset = 0;
  let promise = null;
  let promises = [];

  offset = sendSimulationTime(promises, offset, state.simulationTime);
  for (let model of state.models.entities) {
    offset = asyncSendEntity(promises, offset, model);
  }
  for (let entity of state.entities.entities) {
    offset = asyncSendEntity(promises, offset, entity);
  }

  // XXX(JULIAN): Optimize this so we don't send everything all the time!
  for (let rule of state.oven.rules) {
    offset = asyncSendEntityList(promises, offset, rule.entities);
  }

  await BPromise.all(promises);

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

  for (let destAndInputData of avatarStuffToSend) {
    await asyncSendAvatarInfo(destAndInputData.destination, destAndInputData.data);
  }

  for (let destAndControllers of controllerAttachmentDataToSend) {
    await asyncSendAttachment(destAndControllers.destination, destAndControllers.data);
  }

  for (let segment of state.segments) {
    await asyncSendSegment(offset, segment);
  }


  PERFORMANCE_TRACKER[startFrame].transferTime = nanosecondsFromElapsedDelta(process.hrtime(DEBUG_start_sending));

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