import { MESSAGE_TYPE, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE, GIZMO_VISUALS_FLAGS } from './protocol'
import * as Protocol from './protocol'
import * as FS from 'fs'
import * as BPromise from 'bluebird'
import * as DGRAM from 'dgram'
import { vec3 as Vec3, quat as Quat } from 'gl-matrix'
import * as SH from './spatialHash'
import { ISpatialHash } from './spatialHash'
import { usleep } from 'sleep'

type IVector3 = Vec3;
type IQuaternion = Quat;
type IColor = Uint8Array;

interface IEntity {
  type: MODEL_TYPE;
  id: number;
  pos: IVector3;
  rot: IQuaternion;
  scale: IVector3;
  visible: boolean;
  tint: IColor;
  gizmoVisuals: GIZMO_VISUALS_FLAGS;

  interactionVolume: IInteractionVolume;
  children: IEntityList;
  deleted: boolean;
}

interface ISegment {
  id: number;
  start: IVector3;
  end: IVector3;
  color: IColor;
}

interface IInteractionVolume {
  type: VOLUME_TYPE;
}

interface ISphereInteractionVolume extends IInteractionVolume {
  radius: number;
}

const enum VOLUME_TYPE {
  SPHERE
, NONE
}

const enum SIMULATION_TYPE {
  PAUSED = 0
, FWD_ONE = 1
, FWD_CONT = 2
}

const PORT = 8053;
// const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)
// const HOST = '169.254.255.255'; // Subnet broadcast
// const HOST = '192.168.1.255'; // Subnet broadcast
const HOST = '127.0.0.1';

const NETWORK = DGRAM.createSocket('udp4');

const X_VECTOR3 = Vec3.fromValues(1,0,0);
const Y_VECTOR3 = Vec3.fromValues(0,1,0);
const Z_VECTOR3 = Vec3.fromValues(0,0,1);
const UNIT_VECTOR3 = Vec3.fromValues(1,1,1);
const NULL_VECTOR3 = Vec3.fromValues(0,0,0);
const IDENT_QUAT = Quat.create();
const _tempQuat = Quat.create();
const _tempVec = Vec3.create();

const CELL_SIZE = 1;
const CELL_COUNT = 1024;


let _interval : null|NodeJS.Timer = null;
// const _sendBuffer = Buffer.allocUnsafe(1024);
const _sendBuffer = Buffer.allocUnsafe(131072);
const FPS = 90;
// const FPS = 30;
let _latestEntityId = 0;

const CLOCK_BUTTON_BASE_ROT = Quat.fromValues(-0.7071068, 0, 0, 0.7071068);
const CLOCK_BUTTON_FLIPPED_ROT = Quat.fromValues(0.7071068, 0, 0, 0.7071068);

const OVEN_BUTTON_BASE_ROT = Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907);
const OVEN_BUTTON_FLIPPED_ROT = Quat.fromValues(3.596278e-17, -0.8580354, -0.5170867, -4.186709e-17);

const STATE : IState = getInitialState();

function sendBroadcast (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendTarget (message : Buffer, messageLength: number, host: string, port: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

let _currSeqId = 0;

const BASE_COLOR = new Uint8Array([0xFF,0xFF,0xFF,0xFF]);


const ATTACHMENT_TYPE_TO_MODEL = {};
ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.NONE] = MODEL_TYPE.NONE;
ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.GRAB] = MODEL_TYPE.CONTROLLER_ATTACHMENT_PLIERS;
ATTACHMENT_TYPE_TO_MODEL[CONTROLLER_ATTACHMENT_TYPE.DELETE] = MODEL_TYPE.CONTROLLER_ATTACHMENT_VACUUM;

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

function sendEntityData (offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, entity: IEntity, callback : () => (err: any, bytes: number) => void) {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, entity.rot);
  const pos = Vec3.add(/*out*/Vec3.create()
                      , offsetpos, Vec3.transformQuat(/*out*/_tempVec
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

function sendEntity (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  sendEntityData(NULL_VECTOR3, IDENT_QUAT, UNIT_VECTOR3, entity, callback);
}

function sendEntityList (entityList : IEntityList, callback : () => (err: any, bytes: number) => void) {
  // TODO(JULIAN): Implement scale for entity lists and use it here
  BPromise.each(entityList.entities, (entity) => { return sendEntityDataPromise(entityList.offsetPos, entityList.offsetRot, UNIT_VECTOR3, entity); }).then(() => {
    callback();
  });
}

function sendSegment (segment : ISegment, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSegmentMsg(_sendBuffer, 0, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  sendBroadcast(_sendBuffer, messageLength, callback);
}

function sendSimulationTime (time : number, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSimulationTimeMsg(_sendBuffer, 0, MESSAGE_TYPE.SimulationTime, _currSeqId, time);
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


const sendEntityPromise = BPromise.promisify(sendEntity);
const sendEntityDataPromise = BPromise.promisify(sendEntityData);
const sendEntityListPromise = BPromise.promisify(sendEntityList);
const sendSegmentPromise = BPromise.promisify(sendSegment);
const sendAvatarInfoPromise = BPromise.promisify(sendAvatarInfo);
const sendSimulationTimePromise = BPromise.promisify(sendSimulationTime);
const sendAttachmentPromise = BPromise.promisify(sendAttachment);

function makeEntity (pos : IVector3, rot: IQuaternion, scale: IVector3, tint: IColor, type : MODEL_TYPE) : IEntity {
  return {
    type: type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
  , scale: scale
  , tint: tint
  , visible: true
  , children: makeEntityList(pos, rot)
  , interactionVolume: <ISphereInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.05 }
  , deleted: false
  , gizmoVisuals: GIZMO_VISUALS_FLAGS.None
  };
}

function copyEntityData (out : IEntity, entity : IEntity) {
  out.type = entity.type;
  // out.id = entity.id; // Intentionally omitted
  Vec3.copy(out.pos, entity.pos);
  Quat.copy(out.rot, entity.rot);
  Vec3.copy(out.scale, entity.scale);
  out.visible = entity.visible;
  for (let i = 0; i < entity.tint.length; i++) {
    out.tint[i] = entity.tint[i];
  }
  out.interactionVolume = entity.interactionVolume;
  out.deleted = entity.deleted;
  out.gizmoVisuals = entity.gizmoVisuals;
  // XXX(JULIAN): children omitted! 
}

function cloneEntity (entity : IEntity) : IEntity {
  const pos = Vec3.clone(entity.pos);
  const rot = Quat.clone(entity.rot);
  const children = makeEntityList(pos, rot);
  for (let child of entity.children.entities) {
    children.entities.push(cloneEntity(child));
  }

  return {
    type: entity.type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
  , scale: Vec3.clone(entity.scale)
  , visible: entity.visible
  , children: children
  , tint: new Uint8Array(entity.tint)
  , interactionVolume: entity.interactionVolume
  , deleted: entity.deleted
  , gizmoVisuals: entity.gizmoVisuals
  };
}

function applyOffsetToEntity (entity : IEntity, offsetPos : IVector3, offsetRot : IQuaternion) {
  applyOffsetToPosRot(entity.pos, entity.rot, entity.pos, entity.rot, offsetPos, offsetRot);
}

function applyOffsetToPosRot (outPos : IVector3, outRot : IQuaternion, inPos : IVector3, inRot : IQuaternion, offsetPos : IVector3, offsetRot : IQuaternion) {
  Quat.mul(/*out*/outRot
          , offsetRot, inRot);
  Vec3.add(/*out*/outPos
          , offsetPos, Vec3.transformQuat(/*out*/outPos
                                         , inPos, offsetRot));
}

function applyInverseOffsetToPosRot (outPos : IVector3, outRot : IQuaternion, inPos : IVector3, inRot : IQuaternion, offsetPos : IVector3, offsetRot : IQuaternion) {
  let negRot = Quat.invert(/*out*/Quat.create(), offsetRot);
  let tempOutP = Vec3.create();
  Vec3.transformQuat(/*out*/outPos
                    , Vec3.sub(/*out*/outPos
                              , inPos
                              , offsetPos)
                    , negRot);
  Quat.invert(/*out*/outRot,
             Quat.mul(/*out*/outRot
                     , Quat.invert(/*out*/outRot
                                  , inRot)
                     , offsetRot));
}

// function applyInverseOffsetToPosRot (outPos : IVector3, outRot : IQuaternion, inPos : IVector3, inRot : IQuaternion, offsetPos : IVector3, offsetRot : IQuaternion) {
//   let negRot = Quat.invert(/*out*/Quat.create(), offsetRot);
//   Quat.mul(/*out*/outRot
//           , negRot, inRot);
//   Vec3.sub(/*out*/outPos
//           , Vec3.transformQuat(/*out*/outPos
//                               , inPos, offsetRot)
//           , offsetPos);
// }

// inPosRot: 1,0,0  ;  90 around y ->
// offset: 1,1,0 ; -90 around z 
// outPosRot:  1,1,0 + (1,0,0 rotated by -90 around z)  ; -90 around z then 90 around y 

// - offsetPos
// rotate by inverse offsetRot
// ((1,1,0 + (1,0,0 rotated by -90 around z)) - (1,1,0)) * inverse(-90 around z)    ;   
// 

// perform inverse(inRot)
// = -90 around y then 90 around z
// rotate by offsetRot
// = -90 around y
// perform inverse
// 90 around y

function makeModel (pos : IVector3, rot: IQuaternion, type : MODEL_TYPE) : IEntity {
  return {
    type: type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
  , scale: UNIT_VECTOR3
  , visible: true
  , tint: new Uint8Array([0xFF,0xFF,0xFF,0xFF])
  , interactionVolume: null
  , children: makeEntityList(pos, rot)
  , deleted: false
  , gizmoVisuals: GIZMO_VISUALS_FLAGS.None
  };
}

function makeSegment (start : IVector3, end : IVector3, color: IColor) : ISegment {
  return {
    id: _latestEntityId++
  , start: start
  , end: end
  , color: color
  };
}

interface IButtonState {
  curr: 0|1;
  last: 0|1;
}

interface IHeadset {
  id : number;
  pos : IVector3;
  rot: IQuaternion;
}

interface IController {
  id : number;
  attachmentId : number;
  pos : IVector3;
  interactionVolume: IInteractionVolume;
  rot: IQuaternion;
  grab: IButtonState;
  action0: IButtonState;

  ignore: boolean;

  attachment: CONTROLLER_ATTACHMENT_TYPE;
}

interface IInputData {
  headset: IHeadset;
  controllers: IController[];
}

function makeController (startingAttachment : CONTROLLER_ATTACHMENT_TYPE) : IController {
  return { pos: Vec3.create()
         , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
         , rot: Quat.create()
         , grab: { curr: 0, last: 0 }
         , action0: { curr: 0, last: 0 }
         , id: _latestEntityId++
         , attachmentId: _latestEntityId++
         , ignore: false
         , attachment: startingAttachment };
}

function makeHeadset () : IHeadset {
  return { pos: Vec3.create()
         , rot: Quat.create()
         , id: _latestEntityId++ };
}

// let triangleWave = function (t, halfPeriod) {
//   return (2/halfPeriod) * (t - halfPeriod * (t/halfPeriod + 1/2)) * Math.pow(-1, (t/halfPeriod) + 1/2);
// }

function doesPointOverlapVolume (pt : IVector3, posB : IVector3, volA : IInteractionVolume) {
  if (volA.type == VOLUME_TYPE.SPHERE) {
    return Vec3.sqrDist(pt,posB) <= ((<ISphereInteractionVolume>volA).radius * (<ISphereInteractionVolume>volA).radius);
  }
  return false;
}

function doVolumesOverlap (posA : IVector3, volA : IInteractionVolume, posB : IVector3, volB : IInteractionVolume) {
  if (volA.type == VOLUME_TYPE.SPHERE && volB.type == VOLUME_TYPE.SPHERE) {
    return Vec3.sqrDist(posA,posB) <= ((<ISphereInteractionVolume>volA).radius + (<ISphereInteractionVolume>volB).radius) * 
                                       ((<ISphereInteractionVolume>volA).radius + (<ISphereInteractionVolume>volB).radius);
  }
  return false;
}

function doesControllerOverlapObject (controller : IController, obj : IEntity, objOffsetPos : IVector3, objOffsetRot : IQuaternion) {
  // TODO(JULIAN): Switch the interaction volume to exist on the controller tip!
  Vec3.add(/*out*/_tempVec, objOffsetPos, Vec3.transformQuat(/*out*/_tempVec,obj.pos, objOffsetRot));
  return doVolumesOverlap(controller.pos, controller.interactionVolume
                         , _tempVec, obj.interactionVolume);
}


interface IClock {
  model: IEntity;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
  buttonModels: Map<MODEL_TYPE, IEntity>;
}


const enum CONDITION_TYPE {
  PRESENT, INTERSECT
}

interface ICondition {
  type: CONDITION_TYPE;
}

interface IConditionPresent extends ICondition {
  entity: IEntity;
  originalEntityCopy: IEntity;
}

interface IConditionIntersect extends ICondition {
  entityA: IEntity;
  entityB: IEntity;
}

function makePresentCondition (entity : IEntity) : IConditionPresent {
  return { type: CONDITION_TYPE.PRESENT, entity: entity, originalEntityCopy: cloneEntity(entity) };
}

function makeIntersectCondition (entityA : IEntity, entityB : IEntity) : IConditionIntersect {
  return { type: CONDITION_TYPE.INTERSECT, entityA: entityA, entityB: entityB };
}

function conditionsEqual (condA : ICondition, condB : ICondition) : boolean {
  if (condA.type === condB.type) {
    switch (condA.type) {
      case CONDITION_TYPE.PRESENT:
        return (<IConditionPresent>condA).entity.type === (<IConditionPresent>condB).entity.type;
      case CONDITION_TYPE.INTERSECT:
        return (<IConditionIntersect>condA).entityA.type === (<IConditionIntersect>condB).entityA.type &&
               (<IConditionIntersect>condA).entityB.type === (<IConditionIntersect>condB).entityB.type; 
    }
  }
  return false;
}

const enum ACTION_TYPE {
  MOVE_BY, DELETE
}

interface IAction {
  type: ACTION_TYPE;
}

interface IActionWithEntity extends IAction {
  type: ACTION_TYPE;
  entity: IEntity;
}

interface IActionMoveBy extends IActionWithEntity {
  posOffset: IVector3;
  rotOffset: IQuaternion;
}

interface IActionDelete extends IActionWithEntity {
}

function makeDeleteActionFromAlteration (deleteAlteration : IAlterationDelete) : IActionDelete {
  return { type: ACTION_TYPE.DELETE
         , entity: deleteAlteration.entity};
}

function vectorConstFromGizmoFlag (flag : GIZMO_VISUALS_FLAGS) {
  switch (flag) {
    case GIZMO_VISUALS_FLAGS.XAxis:
    case GIZMO_VISUALS_FLAGS.XRing:
      return X_VECTOR3;
    case GIZMO_VISUALS_FLAGS.YAxis:
    case GIZMO_VISUALS_FLAGS.YRing:
      return Y_VECTOR3;
    case GIZMO_VISUALS_FLAGS.ZAxis:
    case GIZMO_VISUALS_FLAGS.ZRing:
      return Z_VECTOR3;
    default:
      console.error(`Flag ${flag} is unhandled!`)
  }
}

function makeMoveByActionFromAlteration (moveAlteration : IAlterationMove) : IActionMoveBy {
  const controllerPos = moveAlteration.controllerMetadata.controller.pos;
  const controllerRot = moveAlteration.controllerMetadata.controller.rot;
  let entityTargetPos = Vec3.clone(controllerPos);
  let entityTargetRot = Quat.clone(controllerRot);
  applyInverseOffsetToPosRot(entityTargetPos, entityTargetRot, entityTargetPos, entityTargetRot, moveAlteration.entitiesList.offsetPos, moveAlteration.entitiesList.offsetRot);
  Vec3.copy(controllerPos, entityTargetPos);
  Vec3.add(/*out*/entityTargetPos
          , entityTargetPos, Vec3.transformQuat(/*out*/Vec3.create()
                                              , moveAlteration.controllerMetadata.offsetPos, entityTargetRot));

  Quat.mul(/*out*/entityTargetRot, entityTargetRot, moveAlteration.controllerMetadata.offsetRot);

  let entityStartPos = moveAlteration.controllerMetadata.entityStartPos;
  let entityStartRot = moveAlteration.controllerMetadata.entityStartRot;

  const controllerMetadata = moveAlteration.controllerMetadata;


  const oldControllerRot = Quat.create();
  const oldControllerPos = Vec3.create();
  Quat.invert(/*out*/oldControllerRot, Quat.multiply(/*out*/oldControllerRot, controllerMetadata.offsetRot, Quat.invert(/*out*/oldControllerRot, controllerMetadata.entityStartRot)));
  Vec3.sub(/*out*/oldControllerPos, controllerMetadata.entityStartPos, Vec3.transformQuat(/*out*/oldControllerPos, controllerMetadata.offsetPos, oldControllerRot));

  const oldDir = Vec3.create(); 
  Vec3.sub(/*out*/oldDir, oldControllerPos, controllerMetadata.entityStartPos);
  Vec3.normalize(/*out*/oldDir, oldDir);
  const newDir = Vec3.create(); 
  Vec3.sub(/*out*/newDir, controllerPos, controllerMetadata.entityStartPos);
  Vec3.normalize(/*out*/newDir, newDir);

  const constraint = moveAlteration.constraint;
  switch (constraint) {
    case GIZMO_VISUALS_FLAGS.XAxis:
    case GIZMO_VISUALS_FLAGS.YAxis:
    case GIZMO_VISUALS_FLAGS.ZAxis:
      displaceAlongAxisDelta(/*modified*/entityTargetPos, vectorConstFromGizmoFlag(constraint), entityStartPos, entityStartRot, entityTargetPos);
      return <IActionMoveBy>{ type: ACTION_TYPE.MOVE_BY
                            , entity: moveAlteration.entity
                            , posOffset: entityTargetPos
                            , rotOffset: Quat.create() };
    case GIZMO_VISUALS_FLAGS.XRing:
    case GIZMO_VISUALS_FLAGS.YRing:
    case GIZMO_VISUALS_FLAGS.ZRing:
      displaceAlongFromToRotationDelta(/*modified*/entityTargetRot, vectorConstFromGizmoFlag(constraint), entityStartRot, oldDir, newDir);
      return <IActionMoveBy>{ type: ACTION_TYPE.MOVE_BY
                            , entity: moveAlteration.entity
                            , posOffset: Vec3.create()
                            , rotOffset: entityTargetRot };
    default:
      break;
  }

  const deltaPos = Vec3.create(); 
  const deltaRot = Quat.create();
  Vec3.sub(/*out*/deltaPos, entityTargetPos, entityStartPos);
  Quat.invert(/*out*/deltaRot, entityStartRot);
  Vec3.transformQuat(/*out*/deltaPos, deltaPos, deltaRot);
  Quat.mul(/*out*/deltaRot, entityTargetRot, deltaRot);

  return <IActionMoveBy>{ type: ACTION_TYPE.MOVE_BY
                        , entity: moveAlteration.entity
                        , posOffset: deltaPos
                        , rotOffset: deltaRot };
}

interface IRule {
  conditions: ICondition[];
  actions: IAction[];
  entities: IEntityList;
}

interface IOven {
  model: IEntity;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
  buttonModels: Map<MODEL_TYPE, IEntity>;
  rules: IRule[];

  actionIndex: number;
  lastRule: IRule;
  currRule: IRule;
}

interface IShelf {
  model: IEntity;
  clonableModels: IEntityList;
}

function makeEmptyRuleForEntities (entities : IEntity[], state: IState) : IRule {
  //FIXME TODO(JULIAN): IMPLEMENT ME 
  let offset = 0;
  const conditions : ICondition[] = [];
  const entitiesList = makeEntityList(state.oven.model.pos, state.oven.model.rot);
  const ruleEntities : IEntity[] = [];
  const firstEntityPos = Vec3.clone(entities[0].pos);
  Vec3.sub(/*out*/firstEntityPos, firstEntityPos, Vec3.fromValues(0,1.17,0));
  for (let entity of entities) {
    const clone = cloneEntity(entity);
    Vec3.sub(/*out*/clone.pos, clone.pos, firstEntityPos);
    Quat.copy(/*out*/clone.rot, IDENT_QUAT);
    ruleEntities.push(clone);
    conditions.push(makePresentCondition(clone));
  }
  for (let e1Index = 0; e1Index < ruleEntities.length; e1Index++) {
    const e1 = ruleEntities[e1Index];
    for (let e2Index = e1Index+1; e2Index < ruleEntities.length; e2Index++) { // This way we don't duplicate intersection conditions (we store A-B but not B-A)
      const e2 = ruleEntities[e2Index];
      if (doVolumesOverlap(e1.pos, e1.interactionVolume, e2.pos, e2.interactionVolume)) {
        conditions.push(makeIntersectCondition(e1, e2));
      }
    }
  }
  entitiesList.entities.push(...ruleEntities);

  return {
    conditions: conditions
  , actions: []
  , entities: entitiesList
  };
}

function setControllerInteractionPoint (outPt : IVector3, inPos : IVector3, inRot : IQuaternion, attachment : CONTROLLER_ATTACHMENT_TYPE) {
  switch (attachment) {
    case CONTROLLER_ATTACHMENT_TYPE.GRAB:
      const offset = Vec3.fromValues(0, -0.0243, 0.0352);
      Vec3.add(/*out*/outPt
              , inPos, Vec3.transformQuat(/*out*/offset
                                         , offset, inRot));
      break;
    case CONTROLLER_ATTACHMENT_TYPE.DELETE:
      Vec3.copy(/*out*/outPt
               , inPos);
      break;
  }
}

function gizmoFlagsForEntityGivenController (entity: IEntity, sourceList : IEntityList, controller : IController) : GIZMO_VISUALS_FLAGS {
  const gizmoRadius = 0.08011519831; // .5  0.1602303966
  // const gizmoAxisTargetRadius = 0.015;
  const gizmoAxisTargetRadius = 0.03;
  const gizmoAxisTarget : ISphereInteractionVolume = { type: VOLUME_TYPE.SPHERE, radius: gizmoAxisTargetRadius };

  let entityAbsPos = Vec3.create();
  let entityAbsRot = Quat.create();

  applyOffsetToPosRot(/*out*/entityAbsPos, /*out*/entityAbsRot, entity.pos, entity.rot, sourceList.offsetPos, sourceList.offsetRot);
  applyInverseOffsetToPosRot(/*out*/_tempVec, /*out*/_tempQuat, controller.pos, controller.rot, entityAbsPos, entityAbsRot);
  setControllerInteractionPoint(/*out*/_tempVec, _tempVec, _tempQuat, controller.attachment);

  const controllerPos = _tempVec;

  if (doesPointOverlapVolume(controllerPos, Vec3.fromValues(gizmoRadius, 0, 0), gizmoAxisTarget) ||
      doesPointOverlapVolume(controllerPos, Vec3.fromValues(-gizmoRadius, 0, 0), gizmoAxisTarget)
      ) {
    return GIZMO_VISUALS_FLAGS.XAxis;
  }
  if (doesPointOverlapVolume(controllerPos, Vec3.fromValues(0, gizmoRadius, 0), gizmoAxisTarget) ||
      doesPointOverlapVolume(controllerPos, Vec3.fromValues(0, -gizmoRadius, 0), gizmoAxisTarget)
      ) {
    return GIZMO_VISUALS_FLAGS.YAxis;
  }
  if (doesPointOverlapVolume(controllerPos, Vec3.fromValues(0, 0, gizmoRadius), gizmoAxisTarget) ||
      doesPointOverlapVolume(controllerPos, Vec3.fromValues(0, 0, -gizmoRadius), gizmoAxisTarget)
      ) {
    return GIZMO_VISUALS_FLAGS.ZAxis;
  }

  const gizmoRadiusSquared = gizmoRadius * gizmoRadius;
  const gizmoRingTargetThicknessRadius = 0.02610986;
  const gizmoOuterRadius = gizmoRadius+gizmoRingTargetThicknessRadius;
  const gizmoInnerRadius = gizmoRadius-gizmoRingTargetThicknessRadius;
  if ((controllerPos[1]*controllerPos[1] + controllerPos[2]*controllerPos[2] <= gizmoOuterRadius*gizmoOuterRadius) &&
      (controllerPos[1]*controllerPos[1] + controllerPos[2]*controllerPos[2] >= gizmoInnerRadius*gizmoInnerRadius) &&
      Math.abs(controllerPos[0]) <= gizmoRingTargetThicknessRadius) {
        return GIZMO_VISUALS_FLAGS.XRing;
  }
  if ((controllerPos[0]*controllerPos[0] + controllerPos[2]*controllerPos[2] <= gizmoOuterRadius*gizmoOuterRadius) &&
      (controllerPos[0]*controllerPos[0] + controllerPos[2]*controllerPos[2] >= gizmoInnerRadius*gizmoInnerRadius) &&
      Math.abs(controllerPos[1]) <= gizmoRingTargetThicknessRadius) {
        return GIZMO_VISUALS_FLAGS.YRing;
  }
  if ((controllerPos[0]*controllerPos[0] + controllerPos[1]*controllerPos[1] <= gizmoOuterRadius*gizmoOuterRadius) &&
      (controllerPos[0]*controllerPos[0] + controllerPos[1]*controllerPos[1] >= gizmoInnerRadius*gizmoInnerRadius) &&
      Math.abs(controllerPos[2]) <= gizmoRingTargetThicknessRadius) {
        return GIZMO_VISUALS_FLAGS.ZRing;
  }

  return GIZMO_VISUALS_FLAGS.XAxis | GIZMO_VISUALS_FLAGS.YAxis | GIZMO_VISUALS_FLAGS.ZAxis |
         GIZMO_VISUALS_FLAGS.XRing | GIZMO_VISUALS_FLAGS.YRing | GIZMO_VISUALS_FLAGS.ZRing;

}

// function makeEmptyRuleForConditions (state: IState, conditions: ICondition[]) : IRule {
//   let entitiesList = makeEntityList(STATE.oven.model.pos, STATE.oven.model.rot);
//   let offset = 0;
//   for (let cond of conditions) {
//     switch (cond.type) {
//       // TODO(JULIAN): Handle intersection!!!
//       case CONDITION_TYPE.PRESENT:
//         entitiesList.entities.push(makeEntity( Vec3.fromValues(0,0.9+(offset+=0.3),0)
//                                              , Quat.create()
//                                              , Vec3.clone(UNIT_VECTOR3)
//                                              , new Uint8Array([0xFF,0x00,0x00,0xEE])
//                                              , (<IConditionPresent>cond).entity.type));
//     }
//   }
//   return {
//     conditions: conditions
//   , actions: []
//   , entities: entitiesList
//   };
// }

function conditionExistsInConditions (condition: ICondition, conditions: ICondition[]) : boolean {
  for (let testcond of conditions) {
    if (conditionsEqual(testcond, condition)) {
      return true;
    }
  }
  return false;
}

function conditionsMatch (conditionsA: ICondition[], conditionsB: ICondition[]) : boolean {
  if (conditionsA.length !== conditionsB.length) {
    return false;
  }
  for (let testcond of conditionsA) {
    if (!conditionExistsInConditions(testcond, conditionsB)) {
      return false;
    }
  }
  return true;
}

function getIndexOfConditionsInRules (conditions: ICondition[], rules: IRule[]) : number {
  for (let i = rules.length - 1; i >= 0; i--) {
    const currRule = rules[i];
    if (conditionsMatch(conditions, currRule.conditions)) {
      return i;
    }
  }
  return -1;
}

type CollisionHash = number;

function unordered2EntityHash (entityA : IEntity, entityB : IEntity) : CollisionHash {
  let min, max;
  if (entityA.type < entityB.type) {
    min = entityA.type;
    max = entityB.type;
  } else {
    min = entityB.type;
    max = entityA.type;
  }
  return ((max << 16) ^ min);
}

function doesRuleApplyToEntityConfiguration (rule : IRule, entities : IEntity[]) : boolean {
  //TODO(JULIAN): Ensure that this works for interesting intersection cases (since we're ignoring entity refs)
  let requiredPresent = new Map<MODEL_TYPE,number>();
  let requiredIntersect = new Map<CollisionHash,number>();

  for (let cond of rule.conditions) {
    switch (cond.type) {
      case CONDITION_TYPE.PRESENT:
        const comparisonType = (<IConditionPresent>cond).entity.type; 
        requiredPresent.set(comparisonType, (requiredPresent.get(comparisonType) || 0)+1);
        break;
      case CONDITION_TYPE.INTERSECT:
        const comparisonA = (<IConditionIntersect>cond).entityA;
        const comparisonB = (<IConditionIntersect>cond).entityB;
        const test = unordered2EntityHash(comparisonA, comparisonB);
        requiredIntersect.set(test, (requiredIntersect.get(test) || 0) + 1);
        break;
    }
  }

  for (let index1 = 0; index1 < entities.length; index1++) {
    const e1 = entities[index1];
    const eCount = requiredPresent.get(e1.type) || 0;
    if (eCount <= 0) {
      return false;
    }
    requiredPresent.set(e1.type, eCount-1);
    for (let index2 = index1+1; index2 < entities.length; index2++) {
      const e2 = entities[index2];
      if (doVolumesOverlap(e1.pos, e1.interactionVolume, e2.pos, e2.interactionVolume)) {
        const test = unordered2EntityHash(e1, e2);
        const eCount = requiredIntersect.get(test) || 0;
        if (eCount === 0) {
          return false;
        }
        requiredIntersect.set(test, eCount-1);
      }
    }
  }
  for (let v of requiredPresent.values()) {
    if (v !== 0 && v !== undefined) {
      return false;
    }
  }
  for (let v of requiredIntersect.values()) {
    if (v !== 0 && v !== undefined) {
      return false;
    }
  }
  return true;
}

function getIndexOfRuleThatAppliesToEntityConfiguration (entities : IEntity[], rules: IRule[]) : number {
  for (let i = rules.length - 1; i >= 0; i--) {
    const currRule = rules[i];
    if (doesRuleApplyToEntityConfiguration(currRule, entities)) {
      return i;
    }
  }
  return -1;
}

function makeClock (pos : IVector3, rot : IQuaternion) : IClock {
  const buttonModels = new Map<MODEL_TYPE, IEntity>();

  const clockModel = makeModel(pos, rot, MODEL_TYPE.CLOCK);
  // const freezeStateButton = makeModel(Vec3.fromValues(0.3184903,1.474535,0.02016843), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON);
  // buttonModels.set(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, freezeStateButton);
  // clockModel.children.entities.push(freezeStateButton);
  const playPauseButton = makeModel(Vec3.fromValues(-0.08278675,1.095961,0.1116587), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, playPauseButton);
  clockModel.children.entities.push(playPauseButton);
  // const resetStateButton = makeModel(Vec3.fromValues(0.2392679,1.095961,0.09027994), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_RESET_STATE_BUTTON);
  // buttonModels.set(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, resetStateButton);
  // clockModel.children.entities.push(resetStateButton);
  const singleStepButton = makeModel(Vec3.fromValues(-0.32076,1.095961,0.09027993), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, singleStepButton);
  clockModel.children.entities.push(singleStepButton);

  return { model: clockModel
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ /*[MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, {curr: 0, last: 0}]
                                                           ,*/ [MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, {curr: 0, last: 0}]
                                                           /*, [MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, {curr: 0, last: 0}]*/
                                                           , [MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, {curr: 0, last: 0}]])
         , buttonModels: buttonModels };
}

function makeOven (pos : IVector3, rot : IQuaternion) : IOven {
  const buttonModels = new Map<MODEL_TYPE, IEntity>();

  const ovenModel = makeModel(pos, rot, MODEL_TYPE.OVEN);
  const ovenProjectionModel = makeModel(Vec3.fromValues(0,0,0), Quat.fromValues(-0.7071068, 0, 0, 0.7071068), MODEL_TYPE.OVEN_PROJECTION_SPACE);
  ovenProjectionModel.visible = false;
  buttonModels.set(MODEL_TYPE.OVEN_PROJECTION_SPACE, ovenProjectionModel);
  ovenModel.children.entities.push(ovenProjectionModel);
  const ovenCancelButtonModel = makeModel(Vec3.fromValues(0.2389622,0.7320477,0.4061717), Quat.clone(OVEN_BUTTON_BASE_ROT), MODEL_TYPE.OVEN_CANCEL_BUTTON);
  buttonModels.set(MODEL_TYPE.OVEN_CANCEL_BUTTON, ovenCancelButtonModel);
  ovenModel.children.entities.push(ovenCancelButtonModel);
  // const ovenStepBackButtonModel = makeModel(Vec3.fromValues(-0.08082727,0.7320479,0.4061716), Quat.clone(OVEN_BUTTON_BASE_ROT), MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON);
  // buttonModels.set(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, ovenStepBackButtonModel);
  // ovenModel.children.entities.push(ovenStepBackButtonModel);
  // const ovenStepForwardButtonModel = makeModel(Vec3.fromValues(-0.2758612,0.7320479,0.4061716), Quat.clone(OVEN_BUTTON_BASE_ROT), MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON);
  // buttonModels.set(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, ovenStepForwardButtonModel);
  // ovenModel.children.entities.push(ovenStepForwardButtonModel);

  return { model: ovenModel
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ [MODEL_TYPE.OVEN_CANCEL_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, {curr: 0, last: 0}]
                                                           /*, [MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, {curr: 0, last: 0}]
                                                             , [MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, {curr: 0, last: 0}]*/
                                                           ])
         , buttonModels: buttonModels
         , rules: []
         , actionIndex: -1
         , lastRule: null
         , currRule: null
         };
}

function makeEntityList (posOffset : IVector3, rotOffset : IQuaternion) : IEntityList {
  return {
    entities: []
  , offsetPos: posOffset 
  , offsetRot: rotOffset 
  , spatialHash: SH.make<IEntity>(CELL_SIZE, CELL_COUNT)
  };
}

function makeShelf (pos : IVector3, rot: IQuaternion) : IShelf {
  const shelfModel = makeModel(pos, rot, MODEL_TYPE.SHELF);
  const clonableModels : IEntityList = makeEntityList(pos, rot);

  let pedestalX = 0.7305;
  const spherePedestal = makeModel(Vec3.fromValues(pedestalX -= 0.269,0.0778,0), Quat.fromValues(-0.7071068,0,0,0.7071068), MODEL_TYPE.PEDESTAL);
  shelfModel.children.entities.push(spherePedestal);
  const sphereModel = makeEntity(Vec3.fromValues(spherePedestal.pos[0], spherePedestal.pos[1] + 0.1762, spherePedestal.pos[2]), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.SPHERE);
  shelfModel.children.entities.push(sphereModel);
  clonableModels.entities.push(sphereModel);


  const cubePedestal = makeModel(Vec3.fromValues(pedestalX -= 0.269,0.0778,0), Quat.fromValues(-0.7071068,0,0,0.7071068), MODEL_TYPE.PEDESTAL);
  shelfModel.children.entities.push(cubePedestal);
  const cubeModel = makeEntity(Vec3.fromValues(cubePedestal.pos[0], cubePedestal.pos[1] + 0.1762, cubePedestal.pos[2]), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.CUBE);
  shelfModel.children.entities.push(cubeModel);
  clonableModels.entities.push(cubeModel);

  const cylinderPedestal = makeModel(Vec3.fromValues(pedestalX -= 0.269,0.0778,0), Quat.fromValues(-0.7071068,0,0,0.7071068), MODEL_TYPE.PEDESTAL);
  shelfModel.children.entities.push(cylinderPedestal);
  const cylinderModel = makeEntity(Vec3.fromValues(cylinderPedestal.pos[0], cylinderPedestal.pos[1] + 0.1762, cylinderPedestal.pos[2]), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.CYLINDER);
  shelfModel.children.entities.push(cylinderModel);
  clonableModels.entities.push(cylinderModel);

  return {
    model: shelfModel
  , clonableModels: clonableModels
  };
}

const enum ALTERATION_TYPE {
  MOVE
, DELETE
}

interface IAlteration {
  type: ALTERATION_TYPE;
  valid: boolean;
  entitiesList: IEntityList;
}

interface IControllerMetadata {
  controller: IController;
  entityStartPos: IVector3;
  entityStartRot: IQuaternion;
  offsetPos: IVector3;
  offsetRot: IQuaternion;
}

interface IAlterationMove extends IAlteration {
  entity: IEntity;
  controllerMetadata: IControllerMetadata;
  constraint: GIZMO_VISUALS_FLAGS;
}

interface IAlterationDelete extends IAlteration {
  entity: IEntity;
  controllerMetadata : IControllerMetadata;
}

// function makeControllerMetadataFromEntityAndController (entity : IEntity, controller : IController) : IControllerMetadata {
//   const offsetPos : IVector3 = Vec3.create();
//   const offsetRot : IQuaternion = Quat.create();
//   Vec3.transformQuat(/*out*/offsetPos
//                     , Vec3.sub(/*out*/offsetPos
//                               , entity.pos, controller.pos)
//                     , Quat.invert(/*out*/offsetRot
//                                     , controller.rot));

//   Quat.mul(/*out*/offsetRot
//           , Quat.invert(/*out*/offsetRot
//                        , controller.rot), entity.rot);

//   return {
//     controller: controller
//   , startPos: Vec3.clone(entity.pos)
//   , startRot: Quat.clone(entity.rot)
//   , offsetPos: offsetPos
//   , offsetRot: offsetRot
//   };
// }

function makeControllerMetadataFromEntityInEntityListAndController (entity : IEntity, entitiesList : IEntityList, controller : IController) : IControllerMetadata {
  const controllerPos = Vec3.create();
  const controllerRot = Quat.create();
  applyInverseOffsetToPosRot(controllerPos, controllerRot, controller.pos, controller.rot, entitiesList.offsetPos, entitiesList.offsetRot);
  
  const offsetPos : IVector3 = Vec3.create();
  const offsetRot : IQuaternion = Quat.create();
  Vec3.transformQuat(/*out*/offsetPos
                    , Vec3.sub(/*out*/offsetPos
                              , entity.pos, controllerPos)
                    , Quat.invert(/*out*/offsetRot
                                    , controllerRot));

  Quat.mul(/*out*/offsetRot
          , Quat.invert(/*out*/offsetRot
                       , controllerRot), entity.rot);

  return {
    controller: controller
  , entityStartPos: Vec3.clone(entity.pos)
  , entityStartRot: Quat.clone(entity.rot)
  , offsetPos: offsetPos
  , offsetRot: offsetRot
  };
}

function makeMoveAlteration (entity : IEntity, controller : IController, movementConstraint : GIZMO_VISUALS_FLAGS, entitiesList : IEntityList) : IAlterationMove {
  return {
    type: ALTERATION_TYPE.MOVE
  , valid: true
  , entitiesList: entitiesList
  , entity: entity
  , controllerMetadata: makeControllerMetadataFromEntityInEntityListAndController(entity, entitiesList, controller)
  , constraint: movementConstraint
  };
}

function makeDeleteAlteration (entity : IEntity, controller : IController, entitiesList : IEntityList) : IAlterationDelete {
  return {
    type: ALTERATION_TYPE.DELETE
  , valid: true
  , entitiesList: entitiesList
  , entity: entity
  , controllerMetadata: makeControllerMetadataFromEntityInEntityListAndController(entity, entitiesList, controller)
  };
}

interface IState {
  globalTime: number;
  simulationTime: number;
  simulating: SIMULATION_TYPE;
  inputData: Map<string,IInputData>;
  inProgressAlterations: IAlteration[]

  entities: IEntityList;
  storedEntities: IEntityList;
  models: IEntityList;
  clock: IClock;
  oven: IOven;
  shelf: IShelf;
  // latestEntityId: number;
  segments: ISegment[]
}

function saveEntitiesToStoredEntities (state : IState) {
  state.storedEntities.entities.length = 0;
  for (let entity of state.entities.entities) {
    state.storedEntities.entities.push(cloneEntity(entity));
  }
}

function restoreEntitiesFromStoredEntities (state : IState) {
  const oldEntityIds = new Set();
  for (let entity of state.entities.entities) {
    oldEntityIds.add(entity.id);
  }
  for (let entity of state.storedEntities.entities) {
    if (oldEntityIds.has(entity.id)) {
      oldEntityIds.delete(entity.id);
    }
  }
  for (let entity of state.entities.entities) {
    if (oldEntityIds.has(entity.id)) {
      entity.deleted = true; // XXX(JULIAN): Would be better to actually delete the entity?
      state.storedEntities.entities.push(entity);
    }
  }
  state.entities = state.storedEntities;
  state.storedEntities.entities = [];
  saveEntitiesToStoredEntities(state);
}

function getInitialState () : IState {
  let statefile = process.argv[2];
  if (statefile !== undefined) {
    return deserializeStateObject(JSON.parse(FS.readFileSync(statefile, 'utf8')));
  } else {

    // Initial Objects
    const oven = makeOven(Vec3.fromValues(0.008,0,-1.466), Quat.create());
    const clock = makeClock(Vec3.fromValues(-1.485,0,-0.686), Quat.fromValues(0,0.7071068,0,0.7071068));
    const shelf = makeShelf(Vec3.fromValues(1.373,0.921,0), Quat.fromValues(0,-0.7071067,0,0.7071069));

    const entitiesList = makeEntityList(Vec3.create(), Quat.create());
    // entitiesList.entities.push(makeEntity(Vec3.fromValues(0,0.5,0), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.CUBE));
    // entitiesList.entities.push(makeEntity(Vec3.fromValues(0,0.8,0), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.CYLINDER));
    // entitiesList.entities.push(makeEntity(Vec3.fromValues(0,1,0), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.SPHERE));

    const modelsList = makeEntityList(Vec3.create(), Quat.create());
    modelsList.entities.push(clock.model);
    modelsList.entities.push(oven.model);
    modelsList.entities.push(shelf.model);

    const DEFAULT_STATE : IState = {
      globalTime: 0
    , simulationTime: 0
    , simulating: SIMULATION_TYPE.PAUSED
    , inputData: new Map<string,IInputData>()
    , entities: entitiesList
              //  ]
    , storedEntities: makeEntityList(Vec3.create(), Quat.create())
    , models: modelsList
    , clock: clock
    , oven: oven
    , shelf: shelf

    , inProgressAlterations: []
    // , latestEntityId: 0
    , segments: [
                 makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0xFF,0x00,0xFF])) // [0]green
               , makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0x00,0xFF,0xFF])) // [1]blue
               , makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xFF])) // [2]red
               , makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0x00,0xFF])) // [3]yellow
               , makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0xFF,0xFF])) // [4]white
               , makeSegment(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0xFF,0xFF])) // [5]purple
               ]
    };

    // for (let i = 0; i < 500; i++) {
    //   DEFAULT_STATE.entities.push(makeEntity(Vec3.fromValues(0,0.1*i,0), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT))
    // }

    saveEntitiesToStoredEntities(DEFAULT_STATE);
    return DEFAULT_STATE;
  }
}


// let DEBUG_START_POS = Vec3.fromValues(0, 0, 0);
// let DEBUG_END_POS = Vec3.fromValues(1, 1.5, 2);
// // let DEBUG_END_POS = Vec3.fromValues(1, 0.2, 0);

// STATE.controllerData.set('DEBUG', [makeControllerFn()]);
// Vec3.copy(STATE.controllerData.get('DEBUG')[0].pos, DEBUG_START_POS);
// // STATE.controllerData.get('DEBUG')[0].grab.curr = 1;
// STATE.controllerData.get('DEBUG')[0].grab.curr = 0;

// let DEBUG_START_ROT = Quat.setAxisAngle(Quat.create(), Vec3.fromValues(0,0,1), 0);
// let DEBUG_ROT = Quat.setAxisAngle(Quat.create(), Vec3.fromValues(0,1,0), Math.PI/2);

// Quat.copy(STATE.controllerData.get('DEBUG')[0].rot, DEBUG_START_ROT);


interface IEntityList {
  entities: IEntity[];
  offsetPos: IVector3;
  offsetRot: IQuaternion;
  spatialHash: ISpatialHash<IEntity>;
}

// TODO(JULIAN): Optimize, maybe with a spatial hash
function getClosestEntityOfListsToPoint (entityLists: IEntityList[], pt : IVector3) : [IEntity|null, IEntityList] {
  let closest = null;
  let closestSourceList : IEntityList = null;
  let sqrDistance = Infinity;
  
  let XXXc = 0;
  for (let entityList of entityLists) {
    applyInverseOffsetToPosRot(/*out*/_tempVec, /*out*/_tempQuat
                              , pt, IDENT_QUAT, entityList.offsetPos, entityList.offsetRot);

    // for (let cell of SH.cellsSurroundingPosition(_tempVec, entityList.spatialHash)) {
    //   for (let entity of cell) {
    //     if (entity === null || !entity.visible || entity.deleted) {
    //       continue;
    //     }
    //     let currSqrDist = Vec3.sqrDist(entity.pos, _tempVec);  
    //     if (currSqrDist < sqrDistance) {
    //       sqrDistance = currSqrDist; 
    //       closest = entity;
    //       closestSourceList = entityList;
    //     }    
    //   }
    // }
    
    for (let entity of entityList.entities) {
      if (entity === null || !entity.visible || entity.deleted) {
        continue;
      }
      let currSqrDist = Vec3.sqrDist(_tempVec, entity.pos);
      if (currSqrDist < sqrDistance) {
        sqrDistance = currSqrDist; 
        closest = entity;
        closestSourceList = entityList;
      }
    }
  }
  return [closest, closestSourceList];
}

// function getClosestEntityToPoint (entities: IEntity[], pt : IVector3) : IEntity|null {
//   let closest = null;
//   let sqrDistance = Infinity;
//   for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
//     let entity = entities[entityIndex];
//     if (entity === null) {
//       continue;
//     }
//     let currSqrDist = Vec3.sqrDist(entity.pos, pt);
//     if (currSqrDist < sqrDistance) {
//       sqrDistance = currSqrDist; 
//       closest = entity;
//     }
//   }
//   return closest;
// }

function getPosRotForSubObj (outPos : IVector3, outRot : IQuaternion, parent : IEntity, child : IEntity) {
  Quat.mul(/*out*/outRot
          , parent.rot, child.rot);
  Vec3.add(/*out*/outPos
          , parent.pos, Vec3.transformQuat(/*out*/_tempVec
                                         , child.pos, parent.rot));
}

function doProcessClockInput (controllers : IController[]) {
  const buttonTypes = [ MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, /*MODEL_TYPE.CLOCK_RESET_STATE_BUTTON,*/ MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON /*, MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON*/ ];
  let doIntersect = {};
  buttonTypes.forEach((type) => { doIntersect[type] = false; });

  for (let controller of controllers) {
    if (controller.ignore) { continue; }
    for (let type of buttonTypes) {
      getPosRotForSubObj(_tempVec, _tempQuat, STATE.clock.model, STATE.clock.buttonModels.get(type));
      if (doVolumesOverlap(controller.pos, controller.interactionVolume
                          , _tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 })) {
        doIntersect[type] = true;
      }
    }
  }

  for (let type of buttonTypes) {
    const state = STATE.clock.buttonStates.get(type);
    state.curr = doIntersect[type]? 1 : 0;
  }

  const playPauseState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON); 
  if (playPauseState.curr === 1 && playPauseState.last === 0) {
    if (STATE.simulating === SIMULATION_TYPE.PAUSED) {
      STATE.simulating = SIMULATION_TYPE.FWD_CONT;
      Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_FLIPPED_ROT);
    } else {
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
    }
  }

  const stepFwdState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON); 
  if (stepFwdState.curr === 1 && stepFwdState.last === 0) {
      STATE.simulating = SIMULATION_TYPE.FWD_ONE;
      Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
  }

  // const freezeStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON); 
  // if (freezeStateState.curr === 1 && freezeStateState.last === 0) {
  //     STATE.simulationTime = 0;
  //     STATE.simulating = SIMULATION_TYPE.PAUSED;
  //     Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
  //     saveEntitiesToStoredEntities(STATE);
  // }

  // const resetStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON); 
  // if (resetStateState.curr === 1 && resetStateState.last === 0) {
  //     STATE.simulationTime = 0;
  //     STATE.simulating = SIMULATION_TYPE.PAUSED;
  //     Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
  //     restoreEntitiesFromStoredEntities(STATE);
  // }

  for (let type of buttonTypes) {
    const state = STATE.clock.buttonStates.get(type);
    state.last = state.curr; 
  } 
}

function determineObjectsInOven () {
  const objectsInOven : IEntity[] = [];
  const ovenModel = STATE.oven.model;
  Vec3.add(/*out*/_tempVec
          , ovenModel.pos, Vec3.transformQuat(/*out*/_tempVec
                                             , Vec3.fromValues(0, 0.364, 0.039), ovenModel.rot));

  const entities = STATE.entities;
  for (let entity of entities.entities) {
    if ((!entity.deleted && entity.visible) && doVolumesOverlap(entity.pos, entity.interactionVolume
                        , /*oven Center*/_tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.4 })) {
        objectsInOven.push(entity);
    }
  }
  return objectsInOven;
}

function doProcessOvenInput (controllers: IController[], objectsInOven : IEntity[]) {
  const buttonTypes = [ MODEL_TYPE.OVEN_CANCEL_BUTTON /*, MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON*/ ];
  let doIntersect = {};
  buttonTypes.forEach((type) => { doIntersect[type] = false; });

  for (let controller of controllers) {
    if (controller.ignore) { continue; }
    for (let type of buttonTypes) {
      getPosRotForSubObj(_tempVec, _tempQuat, STATE.oven.model, STATE.oven.buttonModels.get(type));
      if (doVolumesOverlap(controller.pos, controller.interactionVolume
                          , _tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 })) {
        doIntersect[type] = true;
      }
    }
  }

  STATE.oven.buttonModels.get(MODEL_TYPE.OVEN_PROJECTION_SPACE).visible = (objectsInOven.length > 0);
  if (objectsInOven.length > 0) {
    // Check if any rule's conditions applies exactly to these objects. If not, we'll make a rule for them
    let ruleIndex = getIndexOfRuleThatAppliesToEntityConfiguration(objectsInOven, STATE.oven.rules);
    if (ruleIndex < 0) {
      // rule for this condition doesn't exist yet, so we need to make it
      ruleIndex = STATE.oven.rules.push(makeEmptyRuleForEntities(objectsInOven, STATE)) - 1;
      console.log("MADE OVEN RULE");
    }
    STATE.oven.currRule = STATE.oven.rules[ruleIndex];
    if (STATE.oven.currRule !== STATE.oven.lastRule) {
      // We switched to a different rule!
      STATE.oven.actionIndex = STATE.oven.currRule.actions.length - 1;
      console.log("Switched to a different rule");
      showEntities(STATE.oven.currRule.entities);
      if (STATE.oven.lastRule !== null) {
        hideEntities(STATE.oven.lastRule.entities);
      }
    }
    // NOTE(JULIAN): Action recording is handled outside of this function, which may be a bit odd
  } else {
    // We're not working on any rules (because there are no objects in the oven)
    STATE.oven.currRule = null;
    STATE.oven.actionIndex = -1;

    if (STATE.oven.lastRule !== null) {
      hideEntities(STATE.oven.lastRule.entities);
    }
  }

  for (let type of buttonTypes) {
    const state = STATE.oven.buttonStates.get(type);
    state.curr = doIntersect[type]? 1 : 0;
  }

  
  const cancelButtonActive = (STATE.oven.currRule !== null && STATE.oven.currRule.actions.length > 0);
  Quat.copy(STATE.oven.buttonModels.get(MODEL_TYPE.OVEN_CANCEL_BUTTON).rot, cancelButtonActive? OVEN_BUTTON_BASE_ROT : OVEN_BUTTON_FLIPPED_ROT);

  const cancelState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_CANCEL_BUTTON); 
  if (cancelState.curr === 1 && cancelState.last === 0 && STATE.oven.currRule !== null) {
    // XXX(JULIAN): Handle this better
    for (let cond of STATE.oven.currRule.conditions) {
      if (cond.type === CONDITION_TYPE.PRESENT) {
        copyEntityData(/*out*/(<IConditionPresent>cond).entity, (<IConditionPresent>cond).originalEntityCopy);
      }
    }
    STATE.oven.currRule.actions.length = 0;
    STATE.oven.actionIndex = -1;
  }

  // const stepBackState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON); 
  // if (stepBackState.curr === 1 && stepBackState.last === 0 && STATE.oven.currRule !== null) {
  //   if (STATE.oven.actionIndex - 1 >= -1 && STATE.oven.actionIndex - 1 < STATE.oven.currRule.actions.length) {
  //     STATE.oven.actionIndex--;
  //   }
  // }

  // const stepForwardState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON); 
  // if (stepForwardState.curr === 1 && stepForwardState.last === 0 && STATE.oven.currRule !== null) {
  //   if (STATE.oven.actionIndex + 1 >= -1 && STATE.oven.actionIndex + 1 < STATE.oven.currRule.actions.length) {
  //     STATE.oven.actionIndex++;
  //   }
  // }

  for (let type of buttonTypes) {
    const state = STATE.oven.buttonStates.get(type);
    state.last = state.curr; 
  }

  STATE.oven.lastRule = STATE.oven.currRule;
}

function entityIsInList (entity : IEntity, entities : IEntity[]) : boolean {
  for (let e of entities) {
    if (e === entity) {
      return true;
    }
  }
  return false;
}

function performActionOnEntity (action : IAction, entity : IEntity) {
  switch (action.type) {
    case ACTION_TYPE.MOVE_BY:
      Vec3.add(entity.pos, entity.pos, Vec3.transformQuat(_tempVec, (<IActionMoveBy>action).posOffset, entity.rot));
      Quat.mul(entity.rot, entity.rot, (<IActionMoveBy>action).rotOffset);
      break;
    case ACTION_TYPE.DELETE:
      entity.deleted = true;
      break;
  }
}

function performSimulationForRuleWith1Cond (entityList : IEntityList, excludeIds : Set<number>, rule : IRule) {
  const cond = rule.conditions[0];
  if (cond.type === CONDITION_TYPE.PRESENT) {
    const eType = (<IConditionPresent>cond).entity.type;
    for (let entity of entityList.entities) {
      if (entity.type === eType && !excludeIds.has(entity.id)) {
        for (let action of rule.actions) {
          performActionOnEntity(action, entity);
        }
      }
    }
  }
}

function performSimulationForRuleWith2Cond (entityList : IEntityList, excludeIds : Set<number>, rule : IRule) {
  const presentConds : IConditionPresent[] = <IConditionPresent[]>rule.conditions.filter((cond) => (cond.type === CONDITION_TYPE.PRESENT));

  const hash = unordered2EntityHash(presentConds[0].entity, presentConds[1].entity);

  const entities = entityList.entities;
  for (let e1Index = 0; e1Index < entities.length; e1Index++) {
    for (let e2Index = e1Index + 1; e2Index < entities.length; e2Index++) {
      let e1 = entities[e1Index];
      let e2 = entities[e2Index];
      if (excludeIds.has(e1.id) || excludeIds.has(e2.id)) {
        continue;
      }
      if (unordered2EntityHash(e1, e2) === hash) {
        if (e1.type !== presentConds[0].entity.type) {
          const temp = e1;
          e1 = e2;
          e2 = temp;
        }
        for (let action of rule.actions) {
          switch (action.type) {
            case ACTION_TYPE.MOVE_BY:
            case ACTION_TYPE.DELETE:
            if ((<IActionWithEntity>action).entity === presentConds[0].entity) {
              performActionOnEntity(action, e1);
            } else {
              performActionOnEntity(action, e2);
            }
          }
        }
        break;
      }
    } 
  }
}

function performSimulationForRuleWith3Cond (entityList : IEntityList, excludeIds : Set<number>, rule : IRule) {
  const intersectCond : IConditionIntersect = <IConditionIntersect>rule.conditions.find((cond) => (cond.type === CONDITION_TYPE.INTERSECT));
  const presentConds : IConditionPresent[] = <IConditionPresent[]>rule.conditions.filter((cond) => (cond.type === CONDITION_TYPE.PRESENT));

  if (intersectCond === undefined || presentConds.length !== 2) {
    // TODO(JULIAN): XXX(JULIAN): Handle 3 objects present instead of just 2 intersecting
    return;
  }

  const hash = unordered2EntityHash(intersectCond.entityA, intersectCond.entityB);

  const entities = entityList.entities;
  for (let e1Index = 0; e1Index < entities.length; e1Index++) {
    for (let e2Index = e1Index + 1; e2Index < entities.length; e2Index++) {
      let e1 = entities[e1Index];
      let e2 = entities[e2Index];
      if (excludeIds.has(e1.id) || excludeIds.has(e2.id) || (e1.deleted) || (e2.deleted) || (!e1.visible) || (!e2.visible)) {
        continue;
      }
      if (unordered2EntityHash(e1, e2) === hash &&
          doVolumesOverlap(e1.pos, e1.interactionVolume, e2.pos, e2.interactionVolume)) {
        if (e1.type !== intersectCond.entityA.type) {
          const temp = e1;
          e1 = e2;
          e2 = temp;
        }
        for (let action of rule.actions) {
          switch (action.type) {
            case ACTION_TYPE.MOVE_BY:
            case ACTION_TYPE.DELETE:
            if ((<IActionWithEntity>action).entity === intersectCond.entityA) {
              performActionOnEntity(action, e1);
            } else {
              performActionOnEntity(action, e2);
            }
          }
        }
        break;
      }
    } 
  }
}

function performSimulation (entityList : IEntityList, excludeIds : Set<number>, rules : IRule[]) {
  for (let rule of rules) {
    if (rule.actions.length == 0) {
      continue; // Short circuit checking
    }
    if (rule.conditions.length === 1) {
      performSimulationForRuleWith1Cond(entityList, excludeIds, rule);
    } else if (rule.conditions.length === 2) {
      //performSimulationForRuleWith2Cond(entityList, excludeIds, rule);
    } else if (rule.conditions.length === 3) {
      performSimulationForRuleWith3Cond(entityList, excludeIds, rule);
    } else {
      console.log(`Unable to handle rule with ${rule.conditions.length} conditions!`);
    }
  }
}

function didControllerJustGrab (controller : IController) : boolean {
  return (controller.grab.curr === 1) && (controller.grab.last === 0);
}

function didControllerJustRelease (controller : IController) : boolean {
  return (controller.grab.curr === 0) && (controller.grab.last === 1);
}

function alterationThatUsesController (controller : IController, alterations : IAlteration[]) : IAlteration | null {
  for (let alteration of alterations) {
    switch (alteration.type) {
      case ALTERATION_TYPE.MOVE:
        if ((<IAlterationMove>alteration).controllerMetadata.controller === controller) {
          return alteration;
        }
        break;
      case ALTERATION_TYPE.DELETE:
        if ((<IAlterationDelete>alteration).controllerMetadata.controller === controller) {
          return alteration;
        }
        break;
    }
  }
  return null;
}

function hideEntities (entityList : IEntityList) {
  for (let entity of entityList.entities) {
    entity.visible = false;
  }
}

function showEntities (entityList : IEntityList) {
  for (let entity of entityList.entities) {
    entity.visible = true;
  }
}

function alterationsThatUseEntity (entity : IEntity, alterations : IAlteration[]) : IAlteration[] {
  const matchingAlterations = [];
  for (let alteration of alterations) {
    switch (alteration.type) {
      case ALTERATION_TYPE.MOVE:
        if ((<IAlterationMove>alteration).entity === entity) {
          matchingAlterations.push(alteration);
        }
        break;
      case ALTERATION_TYPE.DELETE:
        if ((<IAlterationDelete>alteration).entity === entity) {
          matchingAlterations.push(alteration);
        }
        break;
    }
  }
  return matchingAlterations;
}

function projectVectorOntoPlane (outVec: IVector3, inVec: IVector3, unitPlaneNormal : IVector3) {    
  // Projecting inVec onto the plane formed by unitPlaneNormal by subtracting the projection of inVec onto unitPlaneNormal from inVec
  Vec3.sub(/*out*/outVec
          , inVec
          , Vec3.scale(/*out*/outVec
                      , unitPlaneNormal
                      , Vec3.dot(inVec, unitPlaneNormal)));
}

function displaceAlongFromToRotation (outRot : IQuaternion, axis : IVector3, startRot : IQuaternion, inputTargetFromDir : IVector3, inputTargetToDir : IVector3) {
  const displacement = outRot;
  displaceAlongFromToRotationDelta(/*out*/displacement, axis, startRot, inputTargetFromDir, inputTargetToDir);
  Quat.mul(/*out*/outRot, displacement, startRot);
}

function displaceAlongFromToRotationDelta (outRotDelta : IQuaternion, axis : IVector3, startRot : IQuaternion, inputTargetFromDir : IVector3, inputTargetToDir : IVector3) {
  const targetAxis = Vec3.transformQuat(/*out*/Vec3.create(), axis, startRot);

  const fromVec = Vec3.create();
  projectVectorOntoPlane(/*out*/fromVec, inputTargetFromDir, targetAxis);
  Vec3.normalize(/*out*/fromVec, fromVec);
  
  const toVec = Vec3.create();
  projectVectorOntoPlane(/*out*/toVec, inputTargetToDir, targetAxis);
  Vec3.normalize(/*out*/toVec, toVec);

  Quat.rotationTo(/*out*/outRotDelta, fromVec, toVec);
}

function displaceAlongAxisDelta (outPosDelta : IVector3, axis : IVector3, startPos : IVector3, startRot : IQuaternion, inputTargetPos : IVector3) {
  const targetAxis = Vec3.transformQuat(/*out*/Vec3.create(), axis, startRot);
  const targetPosVector = Vec3.sub(/*out*/Vec3.create(), inputTargetPos, startPos);
  const displacementMagnitude = Vec3.dot(targetPosVector, targetAxis);
  Vec3.scale(/*out*/outPosDelta, targetAxis, displacementMagnitude);
}

function displaceAlongAxis (outPos : IVector3, axis : IVector3, startPos : IVector3, startRot : IQuaternion, inputTargetPos : IVector3) {
  const displacement = outPos;
  displaceAlongAxisDelta(/*out*/displacement, axis, startPos, startRot, inputTargetPos);
  Vec3.add(/*out*/outPos, startPos, displacement);
}

function doProcessControllerInput (controllers: IController[]) : IAction[] {
  const newOvenActions : IAction[] = [];
  const newInProgressAlterations : IAlteration[] = [];

  let worldEntities = STATE.entities;
  let ovenEntities = STATE.oven.currRule === null? makeEntityList(STATE.oven.model.pos, STATE.oven.model.rot) : STATE.oven.currRule.entities;
  let shelfEntities = STATE.shelf.clonableModels;
  const entityLists : IEntityList[] = [ worldEntities, ovenEntities, shelfEntities ];

  for (let controller of controllers) {
    if (controller.ignore) { continue; }
    let [closestEntity, sourceList] = getClosestEntityOfListsToPoint(entityLists, controller.pos);
    const overlapsClosest = closestEntity !== null &&
                            doesControllerOverlapObject(controller, closestEntity, sourceList.offsetPos, sourceList.offsetRot);
    let gizmoFlags = GIZMO_VISUALS_FLAGS.None;
    if (overlapsClosest && controller.attachment === CONTROLLER_ATTACHMENT_TYPE.GRAB) {
      gizmoFlags = gizmoFlagsForEntityGivenController(closestEntity, sourceList, controller);
      closestEntity.gizmoVisuals = gizmoFlags; 
    }

    const usedAlteration = alterationThatUsesController(controller, STATE.inProgressAlterations);
    if (usedAlteration === null) {
      // Process if controller not used!
      if (didControllerJustGrab(controller)) {
        if (overlapsClosest) {
          // TODO(JULIAN): Consider making new alterations with multiple controllers for eg scale with two grab controllers
          const alterationsUsingClosestEntity = alterationsThatUseEntity(closestEntity, STATE.inProgressAlterations);
          for (let alt of alterationsUsingClosestEntity) {
            alt.valid = false;
          }

          switch (controller.attachment) {
            case CONTROLLER_ATTACHMENT_TYPE.GRAB:
              if (sourceList === ovenEntities) {
                console.log("MAKING OVEN ALTERATION");
              }
              if (sourceList === shelfEntities) {
                closestEntity = cloneEntity(closestEntity);
                applyOffsetToEntity(closestEntity, sourceList.offsetPos, sourceList.offsetRot); 
                sourceList = worldEntities;
                worldEntities.entities.push(closestEntity);
              }
              newInProgressAlterations.push(makeMoveAlteration(closestEntity, controller, gizmoFlags, sourceList));
              break;
            case CONTROLLER_ATTACHMENT_TYPE.DELETE:
              if (sourceList !== shelfEntities) {
                newInProgressAlterations.push(makeDeleteAlteration(closestEntity, controller, sourceList));
              }
              break;
          }
        }
      }
    } else if (usedAlteration.valid) {
      // Process if controller already used!
      switch (usedAlteration.type) {
        case ALTERATION_TYPE.MOVE:
          const entityToMove = (<IAlterationMove>usedAlteration).entity;
          const controllerMetadata = (<IAlterationMove>usedAlteration).controllerMetadata;

          const controllerPos = _tempVec;
          const controllerRot = _tempQuat;
          applyInverseOffsetToPosRot(/*out*/controllerPos, /*out*/controllerRot
                                    , controller.pos, controller.rot, usedAlteration.entitiesList.offsetPos, usedAlteration.entitiesList.offsetRot);

          
          const entityTargetPos = Vec3.create();
          Vec3.add(/*out*/entityTargetPos
                  , controllerPos, Vec3.transformQuat(/*out*/entityTargetPos
                                                      , controllerMetadata.offsetPos, controllerRot));

          // offsetPos = Vec3.transformQuat(entity.pos - controllerPos, Quat.invert(controllerRot))
          // offsetRot = Quat.invert(controllerRot) * entity.rot

          const oldControllerRot = Quat.create();
          const oldControllerPos = Vec3.create();
          Quat.invert(/*out*/oldControllerRot, Quat.multiply(/*out*/oldControllerRot, controllerMetadata.offsetRot, Quat.invert(/*out*/oldControllerRot, controllerMetadata.entityStartRot)));
          Vec3.sub(/*out*/oldControllerPos, controllerMetadata.entityStartPos, Vec3.transformQuat(/*out*/oldControllerPos, controllerMetadata.offsetPos, oldControllerRot));

          const oldDir = Vec3.create(); 
          Vec3.sub(/*out*/oldDir, oldControllerPos, controllerMetadata.entityStartPos);
          Vec3.normalize(/*out*/oldDir, oldDir);
          const newDir = Vec3.create(); 
          Vec3.sub(/*out*/newDir, controllerPos, controllerMetadata.entityStartPos);
          Vec3.normalize(/*out*/newDir, newDir);

          const constraint = (<IAlterationMove>usedAlteration).constraint;
          switch (constraint) {
            case GIZMO_VISUALS_FLAGS.XAxis:
              displaceAlongAxis(/*modified*/entityToMove.pos, X_VECTOR3, controllerMetadata.entityStartPos, controllerMetadata.entityStartRot, entityTargetPos);
              break;
            case GIZMO_VISUALS_FLAGS.YAxis:
              displaceAlongAxis(/*modified*/entityToMove.pos, Y_VECTOR3, controllerMetadata.entityStartPos, controllerMetadata.entityStartRot, entityTargetPos);
              break;
            case GIZMO_VISUALS_FLAGS.ZAxis:
              displaceAlongAxis(/*modified*/entityToMove.pos, Z_VECTOR3, controllerMetadata.entityStartPos, controllerMetadata.entityStartRot, entityTargetPos);
              break;
            case GIZMO_VISUALS_FLAGS.XRing:
              displaceAlongFromToRotation(entityToMove.rot, X_VECTOR3, controllerMetadata.entityStartRot, oldDir, newDir);
              break;
            case GIZMO_VISUALS_FLAGS.YRing:
              displaceAlongFromToRotation(entityToMove.rot, Y_VECTOR3, controllerMetadata.entityStartRot, oldDir, newDir);
              break;
            case GIZMO_VISUALS_FLAGS.ZRing:
              displaceAlongFromToRotation(entityToMove.rot, Z_VECTOR3, controllerMetadata.entityStartRot, oldDir, newDir);
              break;
            default:
              const entityTargetRot = Quat.mul(/*out*/Quat.create(), controllerRot, controllerMetadata.offsetRot);
              Vec3.copy(/*out*/entityToMove.pos, entityTargetPos);
              Quat.copy(/*out*/entityToMove.rot, entityTargetRot);
            break;
          }


          entityToMove.gizmoVisuals = constraint;

          
          if (didControllerJustRelease(controller)) {
            // DELETE this alteration; make a new action for it...
            if (usedAlteration.entitiesList === ovenEntities) {
              newOvenActions.push(makeMoveByActionFromAlteration(<IAlterationMove>usedAlteration));
            }
          } else {
            newInProgressAlterations.push(usedAlteration);
          }
        break;
        case ALTERATION_TYPE.DELETE:
          const entityToDelete = (<IAlterationDelete>usedAlteration).entity;
          entityToDelete.deleted = true;
          // DELETE this alteration; make a new action for it...
          if (usedAlteration.entitiesList === ovenEntities) {
            newOvenActions.push(makeDeleteActionFromAlteration(<IAlterationDelete>usedAlteration));
          }
        break;
      } 
    }
  }

  STATE.inProgressAlterations.length = 0;
  STATE.inProgressAlterations.push(...newInProgressAlterations);

  return newOvenActions; 
}


function clearGizmosForEntityList (entityList : IEntityList) {
  for (let entity of entityList.entities) {
    entity.gizmoVisuals = GIZMO_VISUALS_FLAGS.None;
  }
}


let _finishedSending : boolean = true;
let _framesDroppedPerSecond = 0;
let _frameCounter = 0;

function stepSimulation (controllers : IController[]) {
  // Quat.slerp(STATE.controllerData.get('DEBUG')[0].rot, DEBUG_START_ROT, DEBUG_ROT, Math.abs(Math.sin(STATE.time)));
  // Vec3.lerp(STATE.controllerData.get('DEBUG')[0].pos, DEBUG_START_POS, DEBUG_END_POS, Math.abs(Math.sin(STATE.time)));

  // Vec3.lerp(STATE.entities[0].pos, DEBUG_START_POS, DEBUG_END_POS, Math.abs(Math.sin(STATE.time)));


  clearGizmosForEntityList(STATE.entities);
  clearGizmosForEntityList(STATE.shelf.clonableModels);
  if (STATE.oven.currRule != null) {
    clearGizmosForEntityList(STATE.oven.currRule.entities);
  }


  doProcessClockInput(controllers);
  const objectsInOven = determineObjectsInOven();
  doProcessOvenInput(controllers, objectsInOven);
  const newOvenActions = doProcessControllerInput(controllers); // NOTE(JULIAN): Mutates controllers
  if (STATE.oven.currRule != null) {
    STATE.oven.currRule.actions.push(...newOvenActions);
    STATE.oven.actionIndex += newOvenActions.length;
  }

  const excludeSet = new Set<number>();
  for (let entity of objectsInOven) {
    excludeSet.add(entity.id);
  }

  if (STATE.simulating === SIMULATION_TYPE.FWD_ONE || STATE.simulating === SIMULATION_TYPE.FWD_CONT) {
    performSimulation(STATE.entities, excludeSet, STATE.oven.rules);
    STATE.simulationTime += 1/FPS;
  }
  if (STATE.simulating === SIMULATION_TYPE.FWD_ONE) {
    STATE.simulating = SIMULATION_TYPE.PAUSED;
  }

  // SH.clearCells(STATE.shelf.clonableModels.spatialHash);
  // for (let entity of STATE.shelf.clonableModels.entities) {
  //   SH.addToCell(entity, entity.pos, STATE.shelf.clonableModels.spatialHash);
  // }

  // SH.clearCells(STATE.entities.spatialHash);
  // for (let entity of STATE.entities.entities) {
  //   SH.addToCell(entity, entity.pos, STATE.entities.spatialHash);
  // }
}

function sendState () {
  sendSimulationTimePromise(STATE.simulationTime).then(() => {
    BPromise.each(STATE.models.entities, (model) => { return sendEntityPromise(model); }).then(() => {
      BPromise.each(STATE.entities.entities, (entity) => { return sendEntityPromise(entity); }).then(() => {
        // XXX(JULIAN): Optimize this so we don't send everything all the time!
        BPromise.each(STATE.oven.rules, (rule) => { return sendEntityListPromise(rule.entities); }).then(() => {
        let avatarStuffToSend = [];
        let controllerAttachmentDataToSend = [];
        for (let remoteClient of STATE.inputData.keys()) {
          for (let [client, inputData] of STATE.inputData) {
            if (remoteClient !== client) {
              avatarStuffToSend.push({destination: remoteClient, data: inputData})
            } else {
              controllerAttachmentDataToSend.push({destination: remoteClient, data: inputData.controllers})
            }
            avatarStuffToSend.push({destination: '127.0.0.1:'+PORT, data: inputData})
          }
        }

        BPromise.each(avatarStuffToSend, (destAndInputData) => { return sendAvatarInfoPromise(destAndInputData.destination, destAndInputData.data); }).then(() => {
          BPromise.each(controllerAttachmentDataToSend, (destAndControllers) => { return sendAttachmentPromise(destAndControllers.destination, destAndControllers.data); }).then(() => {
            // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;

            BPromise.each(STATE.segments, (segment) => { return sendSegmentPromise(segment); }).then(() => {
              // let sending_elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
              // console.log(`{compute: ${compute_elapsed}, sending: ${sending_elapsed}}`);
              // console.log(`DBG>>${compute_elapsed}\t ${sending_elapsed}`);
              _finishedSending = true;
            });

          });
        });

        // console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
        });
      });
    });
  });
}

function stepSimulationAndSend () {
  let DEBUG_start_compute = process.hrtime();

  let controllers = [];
  for (let [client, inputData] of STATE.inputData) {
    for (let controller of inputData.controllers) {
      controllers.push(controller);
    }
  }
  stepSimulation(controllers); // S_t -> S_t+1
  for (let controller of controllers) {
    if (controller.ignore) { continue; }
    controller.grab.last = controller.grab.curr; // So that we can grab things
    controller.action0.last = controller.action0.curr;
  }

  let compute_elapsed = process.hrtime(DEBUG_start_compute)[1] / 1000000;
  if (!_finishedSending) {
    _framesDroppedPerSecond++;      
  } else {
    let DEBUG_start_sending = process.hrtime();
    sendState();
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

  STATE.globalTime += 1/FPS;
}


// async function printDelayed(elements: string[]) {
//     for (const element of elements) {
//         await delay(200);
//         console.log(element);
//     }
// }

// async function delay(milliseconds: number) {
//     return new Promise<void>(resolve => {
//         setTimeout(resolve, milliseconds);
//     });
// }

// printDelayed(["Hello", "beautiful", "asynchronous", "world"]).then(() => {
//     console.log();
//     console.log("Printed every element!");
// });

NETWORK.bind(undefined, undefined, () => {
  NETWORK.setBroadcast(true);
  _interval = setInterval(stepSimulationAndSend, 1000/FPS);
});

NETWORK.on('listening', () => {
    let address = NETWORK.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

// Grab and store controller data
NETWORK.on('message', (message : Buffer, remote) => {
  let client = remote.address + ':' + remote.port;
  let inputData = STATE.inputData;
  if (!inputData.has(client)) {
    console.log(`${client} connected!`);
    inputData.set(client, { headset: makeHeadset()
                          , controllers: [ makeController(CONTROLLER_ATTACHMENT_TYPE.DELETE)
                                         , makeController(CONTROLLER_ATTACHMENT_TYPE.GRAB) ]});
  }

  let offset = 0;
  Vec3.set(/*out*/inputData.get(client).headset.pos
          , message.readFloatLE(offset, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/inputData.get(client).headset.rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));

  Vec3.set(/*out*/inputData.get(client).controllers[0].pos
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/inputData.get(client).controllers[0].rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  inputData.get(client).controllers[0].grab.curr = <0|1>message.readUInt8(offset+=4, true);
  inputData.get(client).controllers[0].action0.curr = <0|1>message.readUInt8(offset+=1, true);

  Vec3.set(/*out*/inputData.get(client).controllers[1].pos
          , message.readFloatLE(offset+=1, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/inputData.get(client).controllers[1].rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  inputData.get(client).controllers[1].grab.curr = <0|1>message.readUInt8(offset+=4, true);
  inputData.get(client).controllers[1].action0.curr = <0|1>message.readUInt8(offset+=1, true);
});


function serializeState (state) : string {
  const stateType = Object.prototype.toString.call(state);
  let res = [];
  switch (stateType) {
    case '[object Null]':
      return 'null';
    case '[object Boolean]':
      return state? 'true': 'false';
    case '[object Uint8Array]':
      return `{"_type": "Uint8Array", "content": [${state.reduce((acc, v) => { acc.push(v); return acc; }, [])}]}`
    case '[object Float32Array]':
      return `{"_type": "Float32Array", "content": [${state.reduce((acc, v) => { acc.push(v); return acc; }, [])}]}`
    case '[object Array]':
      for (let val of state) {
          res.push(serializeState(val));
      }
      return `[${res.join(',')}]`;
    case '[object Object]':
      for (let key in state) {
        if (state.hasOwnProperty(key)) {
          res.push(`"${key}" : ${serializeState(state[key])}`);
        }
      }
      return `{"_type": "Object", "content": {${res.join(',')}}}`;
    case '[object Map]': 
      for (let [key, value] of state) {
        res.push(`"${key}" : ${serializeState(value)}`);
      }
      return `{"_type": "Map", "content": {${res.join(',')}}}`;
    case '[object Date]':
      return `{"_type": "Date", "content": ${(<Date>state).getTime()}}`;
    case '[object Number]':
      return state;
    default:
      console.log(`${stateType} is not handled!!!`);
      return `{"_type": ${stateType}, "content": "UNHANDLED ERROR"}`;
  }
}

function deserializeStateObjectElement (stateObject) {
  const stateType = Object.prototype.toString.call(stateObject);
  switch (stateType) {
    case '[object Boolean]':
    case '[object String]':
    case '[object Number]':
      return stateObject;
    case '[object Array]':
      return stateObject.map((el) => deserializeStateObjectElement(el));
    case '[object Object]':
      if (stateObject.hasOwnProperty('_type')) {
        switch (stateObject._type) {
          case 'Object':
            let objRes = {};
            console.log("DECODE OBJECT");
            for (let key in stateObject.content) {
              if (stateObject.content.hasOwnProperty(key)) {
                console.log(`${key} => ${stateObject.content[key]}`);
                objRes[key] = deserializeStateObjectElement(stateObject.content[key]);
              }
            }
            return objRes;
          case 'Map':
            let mapRes = new Map();
            for (let key in stateObject.content) {
              if (stateObject.content.hasOwnProperty(key)) {
                mapRes.set(key, deserializeStateObjectElement(stateObject.content[key]));
              }
            }
            return mapRes;
          case 'Float32Array':
            return new Float32Array(stateObject.content);
          case 'Uint8Array':
            return new Uint8Array(stateObject.content);
          case 'Date':
            return new Date(stateObject.content);
          default:
            console.log(`${stateObject._type} ain't handled!!!`);
            return null;
        }
      } else {
        console.log("Something went wrong decoding!");
        console.log(stateObject);
        return null;
      }
    case '[object Null]':
      return null;
    default:
      console.log(`${stateType} is not handled!!!`);
      return null;
  }
}

function deserializeStateObject (stateObject) : IState {
  _latestEntityId = stateObject.content._latestEntityId;
  let res = <IState>deserializeStateObjectElement(stateObject.content.STATE);
  return res;
}

process.on('SIGINT', () => {
  clearInterval(_interval);

  // FS.writeFile(`persistentState${(new Date()).getTime()}.json`, serializeState({_latestEntityId: _latestEntityId, STATE: STATE}), function(err) {
  //   if(err) {
  //       return console.log(err);
  //   }

  //   console.log("Saved State to JSON");
  //   setTimeout(() => {
  //     process.exit();
  //   }, 1000);
  // });

  process.exit();
  console.log("NOT SAVING TO JSON!");
});