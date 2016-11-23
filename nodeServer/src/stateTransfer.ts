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


let _currSeqId = 0;
const _sendBuffer = Buffer.allocUnsafe(131072);

const PORT = 8053;
// const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)
// const HOST = '169.254.255.255'; // Subnet broadcast
// const HOST = '192.168.1.255'; // Subnet broadcast
const HOST = '127.0.0.1';

function sendBroadcast (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendTarget (message : Buffer, messageLength: number, host: string, port: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendAvatarInfo (destination: string, inputData : IInputData, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, inputData.headset.id, MODEL_TYPE.HEADSET, inputData.headset.pos, inputData.headset.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
  _currSeqId++;
  let [host, portString] = destination.split(':');
  let port = parseInt(portString, 10);
  let controller0 = inputData.controllers[0];
  let controller1 = inputData.controllers[1];
  sendTarget(_sendBuffer, messageLength, host, port, () => {
    const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller0.id, MODEL_TYPE.CONTROLLER_BASE, controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
    _currSeqId++;
    sendTarget(_sendBuffer, messageLength, host, port, () => {
      const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller1.id, MODEL_TYPE.CONTROLLER_BASE, controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
      _currSeqId++;
      sendTarget(_sendBuffer, messageLength, host, port, () => {
        const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller0.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller0.attachment], controller0.pos, controller0.rot, UNIT_VECTOR3,
         true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
         _currSeqId++;
        sendTarget(_sendBuffer, messageLength, host, port, () => {
          const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller1.attachmentId, ATTACHMENT_TYPE_TO_MODEL[controller1.attachment], controller1.pos, controller1.rot, UNIT_VECTOR3,
          true, BASE_COLOR, GIZMO_VISUALS_FLAGS.None);
          _currSeqId++;
          sendTarget(_sendBuffer, messageLength, host, port, callback);
        });
      });
    });
  });
}

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

function sendEntityData (offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, entity: IEntity, callback : () => (err: any, bytes: number) => void) {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, entity.rot);
  let temp = Vec3.create();
  const pos = Vec3.add(/*out*/temp
                      , offsetpos, Vec3.transformQuat(/*out*/temp
                                                     , entity.pos, offsetrot));
  const scale = Vec3.mul(/*out*/Vec3.create()
                        , entity.scale, offsetscale);
  const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer
                                                                                       , 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel
                                                                                       , _currSeqId
                                                                                       , entity.id
                                                                                       , entity.type
                                                                                       , pos
                                                                                       , rot
                                                                                       , scale
                                                                                       , entity.visible && !entity.deleted 
                                                                                       , entity.tint
                                                                                       , entity.gizmoVisuals);
  _currSeqId++;
  sendBroadcast(_sendBuffer, messageLength, () => {
    BPromise.each(entity.children.entities, (child) => { return sendEntityDataPromise(pos, rot, scale, child); }).then(() => {
      callback();
    })
  });
}

async function asyncSendEntityData (offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, entity: IEntity) : Promise<number> {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, entity.rot);
  let temp = Vec3.create();
  const pos = Vec3.add(/*out*/temp
                      , offsetpos, Vec3.transformQuat(/*out*/temp
                                                     , entity.pos, offsetrot));
  const scale = Vec3.mul(/*out*/Vec3.create()
                        , entity.scale, offsetscale);
  const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer
                                                                                       , 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel
                                                                                       , _currSeqId
                                                                                       , entity.id
                                                                                       , entity.type
                                                                                       , pos
                                                                                       , rot
                                                                                       , scale
                                                                                       , entity.visible && !entity.deleted 
                                                                                       , entity.tint
                                                                                       , entity.gizmoVisuals);
  _currSeqId++;
  let dataCount = 0;
  dataCount += await sendBroadcastPromise(_sendBuffer, messageLength);
  for (let child of entity.children.entities) {
      dataCount += await asyncSendEntityData(pos, rot, scale, child);
  }
  return dataCount;
}

function sendEntity (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  sendEntityData(NULL_VECTOR3, IDENT_QUAT, UNIT_VECTOR3, entity, callback);
}

async function asyncSendEntity (entity : IEntity) : Promise<number> {
  return asyncSendEntityData(NULL_VECTOR3, IDENT_QUAT, UNIT_VECTOR3, entity);
}

function sendEntityList (entityList : IEntityList, callback : () => (err: any, bytes: number) => void) {
  // TODO(JULIAN): Implement scale for entity lists and use it here
  BPromise.each(entityList.entities, (entity) => { return sendEntityDataPromise(entityList.offsetPos, entityList.offsetRot, UNIT_VECTOR3, entity); }).then(() => {
    callback();
  });
}

async function asyncSendEntityList (entityList : IEntityList) : Promise<number> {
  // TODO(JULIAN): Implement scale for entity lists and use it here
  let dataCount = 0;
  for (let entity of entityList.entities) {
      dataCount += await asyncSendEntityData(entityList.offsetPos, entityList.offsetRot, UNIT_VECTOR3, entity);
  }
  return dataCount;
}

function sendSegment (segment : ISegment, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSegmentMsg(_sendBuffer, 0, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  sendBroadcast(_sendBuffer, messageLength, callback);
}

const _controllerAttachmentsBuffer = new Uint8Array([CONTROLLER_ATTACHMENT_TYPE.NONE, CONTROLLER_ATTACHMENT_TYPE.NONE]); 
function sendAttachment (destination: string, controllers : IController[], callback : () => (err: any, bytes: number) => void) {
  const [host, portString] = destination.split(':');
  const port = parseInt(portString, 10);
  _controllerAttachmentsBuffer[0] = controllers[0].attachment;
  _controllerAttachmentsBuffer[1] = controllers[1].attachment;
  const messageLength = Protocol.fillBufferWithControllerAttachmentMsg(_sendBuffer, 0, MESSAGE_TYPE.ControllerAttachment, _currSeqId, _controllerAttachmentsBuffer); 
  _currSeqId++;
  sendTarget(_sendBuffer, messageLength, host, port, callback);
}



const sendBroadcastPromise = BPromise.promisify(sendBroadcast);
const sendTargetPromise = BPromise.promisify(sendTarget);
const sendEntityPromise = BPromise.promisify(sendEntity);
const sendEntityDataPromise = BPromise.promisify(sendEntityData);
const sendEntityListPromise = BPromise.promisify(sendEntityList);
const sendSegmentPromise = BPromise.promisify(sendSegment);
const sendAvatarInfoPromise = BPromise.promisify(sendAvatarInfo);
const sendAttachmentPromise = BPromise.promisify(sendAttachment);

async function asyncSendSimulationTime (time : number) : Promise<number> {
  const messageLength = Protocol.fillBufferWithSimulationTimeMsg(_sendBuffer, 0, MESSAGE_TYPE.SimulationTime, _currSeqId, time);
  _currSeqId++;
  return sendBroadcastPromise(_sendBuffer, messageLength);
}


let _finishedSending : boolean = true;
async function sendState (state : IState, transientState : ITransientState) {
  await asyncSendSimulationTime(state.simulationTime);
  for (let model of state.models.entities) {
    await asyncSendEntity(model);
  }
  for (let entity of state.entities.entities) {
    await asyncSendEntity(entity);
  }

  // XXX(JULIAN): Optimize this so we don't send everything all the time!
  for (let rule of state.oven.rules) {
    await asyncSendEntityList(rule.entities);
  }

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
    await sendAttachmentPromise(destAndControllers.destination, destAndControllers.data);
  }

  for (let segment of state.segments) {
    await sendSegmentPromise(segment);
  }

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
    let DEBUG_start_sending = process.hrtime();
    sendState(state, transientState);
    _finishedSending = false;
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