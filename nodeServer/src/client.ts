import { MESSAGE_TYPE, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE } from './protocol'
import * as Protocol from './protocol'
import * as FS from 'fs'
import * as Promise from 'bluebird'
import * as DGRAM from 'dgram'
import { vec3 as Vec3, quat as Quat, GLM } from 'gl-matrix'

type IVector3 = GLM.IArray;
type IQuaternion = GLM.IArray;
type IColor = Uint8Array;

interface IEntity {
  type: MODEL_TYPE;
  id: number;
  pos: IVector3;
  rot: IQuaternion;
  scale: IVector3;
  visible: boolean;
  tint: IColor;

  interactionVolume: IInteractionVolume;
  children: IEntityList;
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
const HOST = '192.168.1.255'; // Subnet broadcast
// const HOST = '127.0.0.1';

const NETWORK = DGRAM.createSocket('udp4');

const UNIT_VECTOR3 = Vec3.fromValues(1,1,1);
const NULL_VECTOR3 = Vec3.fromValues(0,0,0);
const NULL_QUAT = Quat.create();


let _interval : null|NodeJS.Timer = null;
const _sendBuffer = Buffer.allocUnsafe(1024);
const FPS = 90;
// const FPS = 30;
let _latestEntityId = 0;

const CLOCK_BUTTON_BASE_ROT = Quat.fromValues(-0.7071068, 0, 0, 0.7071068);
const CLOCK_BUTTON_FLIPPED_ROT = Quat.fromValues(0.7071068, 0, 0, 0.7071068);

const STATE : IState = getInitialState();

function sendBroadcast (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendTarget (message : Buffer, messageLength: number, host: string, port: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

let _currSeqId = 0;

const BASE_COLOR = new Uint8Array([0xFF,0xFF,0xFF,0xFF]);

function sendAvatarInfo (destination: string, inputData : IInputData, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, inputData.headset.id, MODEL_TYPE.HEADSET, inputData.headset.pos, inputData.headset.rot, UNIT_VECTOR3, true, BASE_COLOR);
  _currSeqId++;
  let [host, portString] = destination.split(':');
  let port = parseInt(portString, 10);
  let controller0 = inputData.controllers[0];
  let controller1 = inputData.controllers[1];
  sendTarget(_sendBuffer, messageLength, host, port, () => {
    const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller0.id, MODEL_TYPE.CONTROLLER_BASE, controller0.pos, controller0.rot, UNIT_VECTOR3, true, BASE_COLOR);
    sendTarget(_sendBuffer, messageLength, host, port, () => {
      const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleTintModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleVisibleTintModel, _currSeqId, controller1.id, MODEL_TYPE.CONTROLLER_BASE, controller1.pos, controller1.rot, UNIT_VECTOR3, true, BASE_COLOR);
      sendTarget(_sendBuffer, messageLength, host, port, callback);
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
                                                                                   , entity.visible
                                                                                   , entity.tint);
  _currSeqId++;
  sendBroadcast(_sendBuffer, messageLength, () => {
    Promise.each(entity.children.entities, (child) => { return sendModelDataPromise(pos, rot, scale, child); }).then(() => {
      callback();
    })
  });
}

function sendModel (model : IEntity, callback : () => (err: any, bytes: number) => void) {
  sendEntityData(NULL_VECTOR3, NULL_QUAT, UNIT_VECTOR3, model, callback);
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


const sendModelPromise = Promise.promisify(sendModel);
const sendModelDataPromise = Promise.promisify(sendEntityData);
const sendSegmentPromise = Promise.promisify(sendSegment);
const sendAvatarInfoPromise = Promise.promisify(sendAvatarInfo);
const sendSimulationTimePromise = Promise.promisify(sendSimulationTime);

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
  };
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
  };
}

function applyOffsetToEntity (entity : IEntity, offsetPos : IVector3, offsetRot : IQuaternion) {
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetRot, entity.rot);
  const pos = Vec3.add(/*out*/Vec3.create()
                      , offsetPos, Vec3.transformQuat(/*out*/_tempVec
                                                     , entity.pos, offsetRot));
  Vec3.copy(entity.pos, pos);
  Quat.copy(entity.rot, rot);
}

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
  pos : IVector3;
  interactionVolume: IInteractionVolume;
  rot: IQuaternion;
  grab: IButtonState;
  action0: IButtonState;
  pickedUpObject: IEntity|null;
  pickedUpObjectTime: Date;
  pickedUpObjectOffset: IVector3;
  pickedUpObjectRotOffset: IVector3;

  pickedUpObjectPos: IVector3;
  pickedUpObjectRot: IVector3;

  attachment: CONTROLLER_ATTACHMENT_TYPE;
}

interface IInputData {
  headset: IHeadset;
  controllers: IController[];
}

function makeController () : IController {
  return { pos: Vec3.create()
         , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
         , rot: Quat.create()
         , grab: { curr: 0, last: 0 }
         , action0: { curr: 0, last: 0 }
         , pickedUpObject: null
         , pickedUpObjectTime: null
         , pickedUpObjectOffset: Vec3.create()
         , pickedUpObjectRotOffset: Quat.create()
         , pickedUpObjectPos: Vec3.create()
         , pickedUpObjectRot: Quat.create()
         , id: _latestEntityId++
         , attachment: CONTROLLER_ATTACHMENT_TYPE.GRAB };
}

function makeHeadset () : IHeadset {
  return { pos: Vec3.create()
         , rot: Quat.create()
         , id: _latestEntityId++ };
}

// let triangleWave = function (t, halfPeriod) {
//   return (2/halfPeriod) * (t - halfPeriod * (t/halfPeriod + 1/2)) * Math.pow(-1, (t/halfPeriod) + 1/2);
// }

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

interface IPresentCondition extends ICondition {
  objtype: MODEL_TYPE;
}

interface IIntersectCondition extends ICondition {
  objtypea: MODEL_TYPE;
  objtypeb: MODEL_TYPE;
}

function makePresentCondition (objtype : MODEL_TYPE) : IPresentCondition {
  return { type: CONDITION_TYPE.PRESENT, objtype: objtype };
}

function makeIntersectCondition (objtypea : MODEL_TYPE, objtypeb : MODEL_TYPE) : IIntersectCondition {
  return { type: CONDITION_TYPE.INTERSECT, objtypea: objtypea, objtypeb: objtypeb };
}

function conditionsEqual (condA : ICondition, condB : ICondition) : boolean {
  if (condA.type === condB.type) {
    switch (condA.type) {
      case CONDITION_TYPE.PRESENT:
        return (<IPresentCondition>condA).objtype === (<IPresentCondition>condB).objtype;
      case CONDITION_TYPE.INTERSECT:
        return (<IIntersectCondition>condA).objtypea === (<IIntersectCondition>condB).objtypea &&
               (<IIntersectCondition>condA).objtypeb === (<IIntersectCondition>condB).objtypeb; 
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

interface IMoveByAction extends IAction {
  posOffset: IVector3;
  rotOffset: IQuaternion;
}

function makeMoveByAction (posOffset : IVector3, rotOffset : IQuaternion) : IAction {
  return <IMoveByAction>{ type: ACTION_TYPE.MOVE_BY, posOffset: posOffset, rotOffset: rotOffset };
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

function makeEmptyRuleForConditions (state: IState, conditions: ICondition[]) : IRule {
  let entitiesList = makeEntityList(STATE.oven.model.pos, STATE.oven.model.rot);
  let offset = 0;
  for (let cond of conditions) {
    switch (cond.type) {
      case CONDITION_TYPE.PRESENT:
        entitiesList.entities.push(makeEntity( Vec3.add(Vec3.create(), Vec3.fromValues(0,0.9+(offset+=0.3),0), STATE.oven.model.pos)
                                             , Quat.create()
                                             , Vec3.clone(UNIT_VECTOR3)
                                             , new Uint8Array([0xFF,0x00,0x00,0xEE])
                                             , (<IPresentCondition>cond).objtype));
    }
  }
  return {
    conditions: conditions
  , actions: []
  , entities: entitiesList
  };
}

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

function makeClock (pos : IVector3, rot : IQuaternion) : IClock {
  const buttonModels = new Map<MODEL_TYPE, IEntity>();

  const clockModel = makeModel(pos, rot, MODEL_TYPE.CLOCK);
  const freezeStateButton = makeModel(Vec3.fromValues(0.3184903,1.474535,0.02016843), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, freezeStateButton);
  clockModel.children.entities.push(freezeStateButton);
  const playPauseButton = makeModel(Vec3.fromValues(-0.08278675,1.095961,0.1116587), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, playPauseButton);
  clockModel.children.entities.push(playPauseButton);
  const resetStateButton = makeModel(Vec3.fromValues(0.2392679,1.095961,0.09027994), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_RESET_STATE_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, resetStateButton);
  clockModel.children.entities.push(resetStateButton);
  const singleStepButton = makeModel(Vec3.fromValues(-0.32076,1.095961,0.09027993), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON);
  buttonModels.set(MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, singleStepButton);
  clockModel.children.entities.push(singleStepButton);

  return { model: clockModel
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ [MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, {curr: 0, last: 0}]
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
  const ovenCancelButtonModel = makeModel(Vec3.fromValues(0.2389622,0.7320477,0.4061717), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_CANCEL_BUTTON);
  buttonModels.set(MODEL_TYPE.OVEN_CANCEL_BUTTON, ovenCancelButtonModel);
  ovenModel.children.entities.push(ovenCancelButtonModel);
  const ovenStepBackButtonModel = makeModel(Vec3.fromValues(-0.08082727,0.7320479,0.4061716), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON);
  buttonModels.set(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, ovenStepBackButtonModel);
  ovenModel.children.entities.push(ovenStepBackButtonModel);
  const ovenStepForwardButtonModel = makeModel(Vec3.fromValues(-0.2758612,0.7320479,0.4061716), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON);
  buttonModels.set(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, ovenStepForwardButtonModel);
  ovenModel.children.entities.push(ovenStepForwardButtonModel);

  return { model: ovenModel
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ [MODEL_TYPE.OVEN_CANCEL_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, {curr: 0, last: 0}]])
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
  entitiesList: IEntityList;
}

interface IControllerMetadata {
  controller: IController;
  startPos: IVector3;
  startRot: IQuaternion;
  offsetPos: IVector3;
  offsetRot: IQuaternion;
}

interface IAlterationMove extends IAlteration {
  entity: IEntity;
  controllerMetadata: IControllerMetadata;
}

interface IAlterationDelete extends IAlteration {
  entity: IEntity;
  controllerMetadata : IControllerMetadata;
}

function makeControllerMetadataFromEntityAndController (entity : IEntity, controller : IController) : IControllerMetadata {
  const offsetPos : IVector3 = Vec3.create();
  const offsetRot : IQuaternion = Quat.create();
  Vec3.transformQuat(/*out*/offsetPos
                    , Vec3.sub(/*out*/offsetPos
                              , entity.pos, controller.pos)
                    , Quat.invert(/*out*/offsetRot
                                    , controller.rot));

  Quat.mul(/*out*/offsetRot
          , Quat.invert(/*out*/offsetRot
                       , controller.rot), entity.rot);

  return {
    controller: controller
  , startPos: Vec3.clone(entity.pos)
  , startRot: Quat.clone(entity.rot)
  , offsetPos: offsetPos
  , offsetRot: offsetRot
  };
}

function makeMoveAlteration (entity : IEntity, controller : IController, entitiesList : IEntityList) : IAlterationMove {
  return {
    type: ALTERATION_TYPE.MOVE
  , entitiesList: entitiesList
  , entity: entity
  , controllerMetadata: makeControllerMetadataFromEntityAndController(entity, controller)
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
      entity.visible = false; // XXX(JULIAN): Would be better to actually delete the entity... 
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
    , segments: []
              //    makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0xFF,0x00,0xFF])) // green
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0x00,0xFF,0xFF])) // blue
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xFF])) // red
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0x00,0xFF]))
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0xFF,0xFF]))
              //  ]
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
}


// TODO(JULIAN): Optimize, maybe with a spatial hash
function getClosestEntityOfListsToPoint (entityLists: IEntityList[], pt : IVector3) : [IEntity|null, IEntityList] {
  let closest = null;
  let closestSourceList : IEntityList = null;
  let sqrDistance = Infinity;
  for (let entityList of entityLists) {
    for (let entity of entityList.entities) {
      if (entity === null) {
        continue;
      }
      Vec3.add(/*out*/_tempVec
              , entityList.offsetPos
              , Vec3.transformQuat(/*out*/_tempVec
                                  , entity.pos, entityList.offsetRot));
      let currSqrDist = Vec3.sqrDist(_tempVec, pt);
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

function pickUpEntityWithController (entity: IEntity, controller: IController) {
  controller.pickedUpObject = entity;
  controller.pickedUpObjectTime = new Date();

  Vec3.copy(/*out*/controller.pickedUpObjectPos, entity.pos);
  Quat.copy(/*out*/controller.pickedUpObjectRot, entity.rot);

  Vec3.transformQuat(/*out*/controller.pickedUpObjectOffset
                    , Vec3.sub(/*out*/controller.pickedUpObjectOffset
                              , entity.pos, controller.pos)
                    , Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                    , controller.rot));

  Quat.mul(/*out*/controller.pickedUpObjectRotOffset
          , Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                      , controller.rot), entity.rot);
}

function getPosRotForSubObj (outPos : IVector3, outRot : IQuaternion, parent : IEntity, child : IEntity) {
  Quat.mul(/*out*/outRot
          , parent.rot, child.rot);
  Vec3.add(/*out*/outPos
          , parent.pos, Vec3.transformQuat(/*out*/_tempVec
                                         , child.pos, parent.rot));
}

function doProcessClockInput () {
  const buttonTypes = [ MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON ];
  let doIntersect = {};
  buttonTypes.forEach((type) => { doIntersect[type] = false; });
  for (let [client, inputData] of STATE.inputData) {
      let controllers = inputData.controllers;
      for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
        let controller = controllers[controllerIndex];
        for (let type of buttonTypes) {
          getPosRotForSubObj(_tempVec, _tempQuat, STATE.clock.model, STATE.clock.buttonModels.get(type));
          if (doVolumesOverlap(controller.pos, controller.interactionVolume
                              , _tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 })) {
            doIntersect[type] = true;
          }
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

  const freezeStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON); 
  if (freezeStateState.curr === 1 && freezeStateState.last === 0) {
      STATE.simulationTime = 0;
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
      saveEntitiesToStoredEntities(STATE);
  }

  const resetStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON); 
  if (resetStateState.curr === 1 && resetStateState.last === 0) {
      STATE.simulationTime = 0;
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.clock.buttonModels.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
      restoreEntitiesFromStoredEntities(STATE);
  }

  for (let type of buttonTypes) {
    const state = STATE.clock.buttonStates.get(type);
    state.last = state.curr; 
  } 
}

function doProcessOvenInput () {
  const buttonTypes = [ MODEL_TYPE.OVEN_CANCEL_BUTTON, MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON ];
  let doIntersect = {};
  buttonTypes.forEach((type) => { doIntersect[type] = false; });
  for (let [client, inputData] of STATE.inputData) {
      let controllers = inputData.controllers;
      for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
        let controller = controllers[controllerIndex];
        for (let type of buttonTypes) {
          getPosRotForSubObj(_tempVec, _tempQuat, STATE.oven.model, STATE.oven.buttonModels.get(type));
          if (doVolumesOverlap(controller.pos, controller.interactionVolume
                              , _tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 })) {
            doIntersect[type] = true;
          }
        }
      }
  }


  const objectsInOven : IEntity[] = [];
  const ovenModel = STATE.oven.model;
  Vec3.add(/*out*/_tempVec
          , ovenModel.pos, Vec3.transformQuat(/*out*/_tempVec
                                             , Vec3.fromValues(0, 0.364, 0.039), ovenModel.rot));

  const entities = STATE.entities;
  for (let entity of entities.entities) {
    if (doVolumesOverlap(entity.pos, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
                        , /*oven Center*/_tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.4 })) {
        objectsInOven.push(entity);
    }
  }
  STATE.oven.buttonModels.get(MODEL_TYPE.OVEN_PROJECTION_SPACE).visible = (objectsInOven.length > 0);
  let conditions : ICondition[] = [];
  if (objectsInOven.length > 0) {
    for (var obj of objectsInOven) {
      conditions.push(makePresentCondition(obj.type));
      for (var obj2 of objectsInOven) {
        if (doVolumesOverlap(obj.pos, obj.interactionVolume, obj2.pos, obj2.interactionVolume)) {
          conditions.push(makeIntersectCondition(obj.type, obj2.type));
        }
      } 
    }

    let ruleIndex = getIndexOfConditionsInRules(conditions, STATE.oven.rules);
    if (ruleIndex < 0) {
      // rule for this condition doesn't exist yet, so we need to make it
      ruleIndex = STATE.oven.rules.push(makeEmptyRuleForConditions(STATE, conditions)) - 1;
    }
    STATE.oven.currRule = STATE.oven.rules[ruleIndex];
    if (STATE.oven.currRule != STATE.oven.lastRule) {
      // We switched to a different rule!
      STATE.oven.actionIndex = STATE.oven.currRule.actions.length - 1;
    }

    // TODO(JULIAN): Implement actions!
    //const newActions = doProcessControllerInput(STATE.oven.rules[ruleIndex].entities, true);
    //STATE.oven.rules[ruleIndex].actions.push(...newActions);

  } else {
    // We're not working on any rules
    STATE.oven.currRule = null;
    STATE.oven.actionIndex = -1;
  }

  for (let type of buttonTypes) {
    const state = STATE.oven.buttonStates.get(type);
    state.curr = doIntersect[type]? 1 : 0;
  }

  const cancelState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_CANCEL_BUTTON); 
  if (cancelState.curr === 1 && cancelState.last === 0) {
    // TODO(JULIAN): Delete all actions on this rule
  }

  const stepBackState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON); 
  if (stepBackState.curr === 1 && stepBackState.last === 0) {
    if (STATE.oven.actionIndex - 1 >= -1 && STATE.oven.actionIndex - 1 < STATE.oven.currRule.actions.length) {
      STATE.oven.actionIndex--;
    }
  }

  const stepForwardState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON); 
  if (stepForwardState.curr === 1 && stepForwardState.last === 0) {
    if (STATE.oven.actionIndex + 1 >= -1 && STATE.oven.actionIndex + 1 < STATE.oven.currRule.actions.length) {
      STATE.oven.actionIndex++;
    }
  }

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
      Vec3.add(entity.pos, entity.pos, (<IMoveByAction>action).posOffset);
      // Vec3.add(entity.rot, entity.rot, (<IMoveByAction>action).rotOffset);
      break;
    case ACTION_TYPE.DELETE:
      console.error("TODO(JULIAN): Implement 'Delete' action");
      break;
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

function doProcessControllerInput () : IAction[] {
  const newActions : IAction[] = [];
  const newInProgressAlterations : IAlteration[] = [];

  let worldEntities = STATE.entities;
  let ovenEntities = STATE.oven.currRule === null? makeEntityList(STATE.oven.model.pos, STATE.oven.model.rot) : STATE.oven.currRule.entities;
  let shelfEntities = STATE.shelf.clonableModels;
  const entityLists : IEntityList[] = [ worldEntities, ovenEntities, shelfEntities ];
  // STATE.inProgressAlterations


  for (let [client, inputData] of STATE.inputData) {
    let controllers = inputData.controllers;
    for (let controller of controllers) {
      const usedAlteration = alterationThatUsesController(controller, STATE.inProgressAlterations);
      if (usedAlteration === null) {
        // Process if controller not used!
        if (didControllerJustGrab(controller)) {
          let [closestEntity, sourceList] = getClosestEntityOfListsToPoint(entityLists, controller.pos);
          if (closestEntity !== null) {
            // TODO(JULIAN): If the entity already exists in another alteration, need to replace that alteration or modify it or delete it

            // TODO(JULIAN): Handle Delete Alterations as well as move; based on the controller tip
            if (doesControllerOverlapObject(controller, closestEntity, sourceList.offsetPos, sourceList.offsetRot)) {
              if (sourceList === shelfEntities) {
                closestEntity = cloneEntity(closestEntity);
                applyOffsetToEntity(closestEntity, sourceList.offsetPos, sourceList.offsetRot); 
                sourceList = worldEntities;
                worldEntities.entities.push(closestEntity);
              }
              
              newInProgressAlterations.push(makeMoveAlteration(closestEntity, controller, sourceList));
            }
          }
        }
      } else {
        // Process if controller already used!
        switch (usedAlteration.type) {
          case ALTERATION_TYPE.MOVE:
            const entityToMove = (<IAlterationMove>usedAlteration).entity;
            const controllerMetadata = (<IAlterationMove>usedAlteration).controllerMetadata;

            Vec3.add(/*out*/entityToMove.pos
                    , controller.pos, Vec3.transformQuat(/*out*/entityToMove.pos
                                                        , controllerMetadata.offsetPos, controller.rot));

            Quat.mul(/*out*/entityToMove.rot, controller.rot, controllerMetadata.offsetRot);
            
            if (didControllerJustRelease(controller)) {
              // DELETE this alteration; make a new action for it...
            } else {
              newInProgressAlterations.push(usedAlteration);
            }
          break;
          case ALTERATION_TYPE.DELETE:
            // (<IAlterationDelete>usedAlteration)

          break;
        } 
        
      }
    }
  }

  for (let [client, inputData] of STATE.inputData) {
    let controllers = inputData.controllers;
    for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
      let controller = controllers[controllerIndex];
      controller.grab.last = controller.grab.curr; // So that we can grab things
      controller.action0.last = controller.action0.curr;
    }
  }

  STATE.inProgressAlterations.length = 0;
  STATE.inProgressAlterations.push(...newInProgressAlterations);

  return newActions; 
}


const _tempQuat = Quat.create();
const _tempVec = Vec3.create();

NETWORK.bind(undefined, undefined, () => {
  NETWORK.setBroadcast(true);
  _interval = setInterval(() => {

    let DEBUG_start_sending = process.hrtime();

    // Quat.slerp(STATE.controllerData.get('DEBUG')[0].rot, DEBUG_START_ROT, DEBUG_ROT, Math.abs(Math.sin(STATE.time)));
    // Vec3.lerp(STATE.controllerData.get('DEBUG')[0].pos, DEBUG_START_POS, DEBUG_END_POS, Math.abs(Math.sin(STATE.time)));

    // Vec3.lerp(STATE.entities[0].pos, DEBUG_START_POS, DEBUG_END_POS, Math.abs(Math.sin(STATE.time)));

    // doProcessClockInput();
    // doProcessOvenInput();
    // doProcessControllerInput(STATE.entities, false);
    doProcessControllerInput();

    if (STATE.simulating === SIMULATION_TYPE.FWD_ONE || STATE.simulating === SIMULATION_TYPE.FWD_CONT) {
      const entities = STATE.entities;
      for (let entity of entities.entities) {
        // Vec3.scaleAndAdd(entity.pos, entity.pos, Vec3.transformQuat(_tempVec, entity.vel, entity.rot), 1/FPS); // pos = pos + vel * dt_in_units_per_sec

        // FIXME(JULIAN) XXX(JULIAN): This improperly checks to see if rules apply
        for (let rule of STATE.oven.rules) {
          let ruleApplies = true;
          for (let cond of rule.conditions) {
            if (cond.type === CONDITION_TYPE.PRESENT && (<IPresentCondition>cond).objtype !== entity.type) {
              ruleApplies = false;
            }
          }
          if (ruleApplies) {
            console.log(`ACTION COUNT: ${rule.actions.length}`)
            for (let action of rule.actions) {
              performActionOnEntity(action, entity);
              console.log(`DOING: posOffset ${(<IMoveByAction>action).posOffset}`);
            }
          }
        }

      }
      STATE.simulationTime += 1/FPS;
    }
    if (STATE.simulating === SIMULATION_TYPE.FWD_ONE) {
      STATE.simulating = SIMULATION_TYPE.PAUSED;
    }


    // TRANSFER STATE
    sendSimulationTimePromise(STATE.simulationTime).then(() => {
      Promise.each(STATE.models.entities, (model) => { return sendModelPromise(model); }).then(() => {
        Promise.each(STATE.entities.entities, (entity) => { return sendModelPromise(entity); }).then(() => {

          // FIXME(JULIAN) XXX(JULIAN): This only supports one rule!!!
          Promise.each(STATE.oven.rules.length > 0? STATE.oven.rules[0].entities.entities : [], (entity) => { return sendModelPromise(entity); }).then(() => {
        // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          let avatarStuffToSend = [];
          for (let remoteClient of STATE.inputData.keys()) {
            for (let [client, inputData] of STATE.inputData) {
              if (remoteClient !== client) {
                avatarStuffToSend.push({destination: remoteClient, data: inputData})
              }
              avatarStuffToSend.push({destination: '127.0.0.1:'+PORT, data: inputData})
            }
          }


          Promise.each(avatarStuffToSend, (destAndInputData) => { return sendAvatarInfoPromise(destAndInputData.destination, destAndInputData.data); }).then(() => {
            let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          });


          // Promise.each(STATE.segments, (segment) => { return sendSegmentFn(segment); }).then(() => {
          //   let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          // });

          // console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");

          });
        });
      });
    });

    STATE.globalTime += 1/FPS;
  }, 1000/FPS);
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
                          , controllers: [ makeController()
                                         , makeController() ]});
  }

  // inputData.get(client)[0].grab.last = inputData.get(client)[0].grab.curr;
  // inputData.get(client)[1].grab.last = inputData.get(client)[1].grab.curr;

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