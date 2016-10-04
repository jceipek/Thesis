import {MESSAGE_TYPE, MODEL_TYPE} from './protocol'
import * as Protocol from './protocol'
import * as FS from 'fs'
import * as Promise from 'bluebird'
import * as DGRAM from 'dgram'
import { vec3 as Vec3, quat as Quat, GLM } from 'gl-matrix'

type IVector3 = GLM.IArray;
type IQuaternion = GLM.IArray;
type IColor = Uint8Array;

interface IEntity {
  type: ENTITY_TYPE;
  id: number;
  pos: IVector3;
  rot: IQuaternion;
  vel: IVector3;
  color: IColor;
}

interface IModel {
  type: MODEL_TYPE;
  id: number;
  pos: IVector3;
  rot: IQuaternion;
  scale: IVector3;
  visible: boolean;

  children: Map<MODEL_TYPE, IModel>;
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
}

const enum ENTITY_TYPE {
  DEFAULT = 0
, CLONER = 1
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

function sendBroadcastFn (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

function sendTargetFn (message : Buffer, messageLength: number, host: string, port: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, port, host, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

let _currSeqId = 0;
function sendEntityPosition (obj : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionMsg(_sendBuffer, 0, MESSAGE_TYPE.Position, _currSeqId, obj.id, obj.pos);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

function sendEntityPositionRotation (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotation, _currSeqId, entity.id, entity.pos, entity.rot);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

function sendAvatarInfo (destination: string, inputData : IInputData, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationScaleModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleModel, _currSeqId, inputData.headset.id, MODEL_TYPE.HEADSET, inputData.headset.pos, inputData.headset.rot, UNIT_VECTOR3);
  _currSeqId++;
  let [host, portString] = destination.split(':');
  let port = parseInt(portString, 10);
  let controller0 = inputData.controllers[0];
  let controller1 = inputData.controllers[1];
  sendTargetFn(_sendBuffer, messageLength, host, port, () => {
    const messageLength = Protocol.fillBufferWithPositionRotationScaleModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleModel, _currSeqId, controller0.id, MODEL_TYPE.CONTROLLER_BASE, controller0.pos, controller0.rot, UNIT_VECTOR3);
    sendTargetFn(_sendBuffer, messageLength, host, port, () => {
      const messageLength = Protocol.fillBufferWithPositionRotationScaleModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleModel, _currSeqId, controller1.id, MODEL_TYPE.CONTROLLER_BASE, controller1.pos, controller1.rot, UNIT_VECTOR3);
      sendTargetFn(_sendBuffer, messageLength, host, port, callback);
    });
  });
}

function sendEntityPositionRotationVelocityColor (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationVelocityColorMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationVelocityColor, _currSeqId, entity.id, entity.pos, entity.rot, entity.vel, entity.color);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

function sendModelData (offsetpos : IVector3, offsetrot : IQuaternion, offsetscale : IVector3, model: IModel, callback : () => (err: any, bytes: number) => void) {  
  const rot = Quat.mul(/*out*/Quat.create()
                      , offsetrot, model.rot);
  const pos = Vec3.add(/*out*/Vec3.create()
                      , offsetpos, Vec3.transformQuat(/*out*/_tempVec
                                                     , model.pos, offsetrot));
  const scale = Vec3.mul(/*out*/Vec3.create()
                        , model.scale, offsetscale);
  const messageLength = Protocol.fillBufferWithPositionRotationScaleVisibleModelMsg(_sendBuffer
                                                                                   , 0, MESSAGE_TYPE.PositionRotationScaleVisibleModel
                                                                                   , _currSeqId
                                                                                   , model.id
                                                                                   , model.type
                                                                                   , pos
                                                                                   , rot
                                                                                   , scale
                                                                                   , model.visible);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, () => {
    // XXX(JULIAN): Super Hacky:
    const children = [];
    for (let child of model.children.values()) {
      children.push(child);
    }
    Promise.each(children, (child) => { return sendModelDataFn(pos, rot, scale, child); }).then(() => {
      callback();
    })
  });
}

function sendModelPositionRotationScaleVisibility (model : IModel, callback : () => (err: any, bytes: number) => void) {
  sendModelData(NULL_VECTOR3, NULL_QUAT, UNIT_VECTOR3, model, callback);
}

function sendSegment (segment : ISegment, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSegmentMsg(_sendBuffer, 0, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

function sendSimulationTime (time : number, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSimulationTimeMsg(_sendBuffer, 0, MESSAGE_TYPE.SimulationTime, _currSeqId, time);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

const sendEntityPositionFn = Promise.promisify(sendEntityPosition);
const sendEntityPositionRotationFn = Promise.promisify(sendEntityPositionRotation);
const sendEntityPositionRotationVelocityColorFn = Promise.promisify(sendEntityPositionRotationVelocityColor);
const sendModelPositionRotationScaleVisibilityFn = Promise.promisify(sendModelPositionRotationScaleVisibility);
const sendModelDataFn = Promise.promisify(sendModelData);
const sendSegmentFn = Promise.promisify(sendSegment);
const sendAvatarInfoFn = Promise.promisify(sendAvatarInfo);
const sendSimulationTimeFn = Promise.promisify(sendSimulationTime);

function makeEntityFn (pos : IVector3, rot: IQuaternion, vel: IVector3, color: IColor, type : ENTITY_TYPE) : IEntity {
  return <IEntity>{
    type: type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
  , vel: vel
  , color: color
  , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.05 }
  };
}

function cloneEntity (entity : IEntity) {
  return <IEntity>{
    type: entity.type
  , id: entity.id
  , pos: Vec3.clone(entity.pos)
  , rot: Quat.clone(entity.rot)
  , vel: Vec3.clone(entity.vel)
  , color: new Uint8Array(entity.color)
  , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.05 } // FIXME(JULIAN): This is really bad because it ignores the actual volume
  };
}

function makeModelFn (pos : IVector3, rot: IQuaternion, type : MODEL_TYPE) : IModel {
  return {
    type: type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
  , scale: UNIT_VECTOR3
  , visible: true
  , children: new Map<MODEL_TYPE, IModel>()
  };
}


function makeOvenModelFn (pos : IVector3, rot: IQuaternion) : IModel {
  const oven = makeModelFn(pos, rot, MODEL_TYPE.OVEN);
  const ovenProjection = makeModelFn(Vec3.fromValues(0,0,0), Quat.fromValues(-0.7071068, 0, 0, 0.7071068), MODEL_TYPE.OVEN_PROJECTION_SPACE);
  ovenProjection.visible = false;
  oven.children.set(MODEL_TYPE.OVEN_PROJECTION_SPACE, ovenProjection);
  const ovenCancelButton = makeModelFn(Vec3.fromValues(0.2389622,0.7320477,0.4061717), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_CANCEL_BUTTON);
  oven.children.set(MODEL_TYPE.OVEN_CANCEL_BUTTON, ovenCancelButton);
  const ovenStepBackButton = makeModelFn(Vec3.fromValues(-0.08082727,0.7320479,0.4061716), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON);
  oven.children.set(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, ovenStepBackButton);
  const ovenStepForwardButton = makeModelFn(Vec3.fromValues(-0.2758612,0.7320479,0.4061716), Quat.fromValues(-0.8580354, 3.596278e-17, -4.186709e-17, 0.5135907), MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON);
  oven.children.set(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, ovenStepForwardButton);
  return oven;
}

function makeClockModelFn (pos : IVector3, rot: IQuaternion) : IModel {
  const clock = makeModelFn(pos, rot, MODEL_TYPE.CLOCK);
  const freezeStateButton = makeModelFn(Vec3.fromValues(0.3184903,1.474535,0.02016843), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON);
  clock.children.set(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, freezeStateButton);
  const playPauseButton = makeModelFn(Vec3.fromValues(-0.08278675,1.095961,0.1116587), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON);
  clock.children.set(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, playPauseButton);
  const resetStateButton = makeModelFn(Vec3.fromValues(0.2392679,1.095961,0.09027994), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_RESET_STATE_BUTTON);
  clock.children.set(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, resetStateButton);
  const singleStepButton = makeModelFn(Vec3.fromValues(-0.32076,1.095961,0.09027993), Quat.clone(CLOCK_BUTTON_BASE_ROT), MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON);
  clock.children.set(MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, singleStepButton);
  return clock;
}

function makeSegmentFn (start : IVector3, end : IVector3, color: IColor) : ISegment {
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
}

interface IInputData {
  headset: IHeadset;
  controllers: IController[];
}

function makeControllerFn () : IController {
  return { pos: Vec3.create()
         , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
         , rot: Quat.create()
         , grab: { curr: 0, last: 0 }
         , action0: { curr: 0, last: 0 }
         , pickedUpObject: null
         , pickedUpObjectTime: null
         , pickedUpObjectOffset: Vec3.create()
         , pickedUpObjectRotOffset: Quat.create()
         , id: _latestEntityId++ };
}

function makeHeadsetFn () : IHeadset {
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

function doesControllerOverlapObject (controller, obj) {
  return doVolumesOverlap(controller.pos, controller.interactionVolume
                         , obj.pos, obj.interactionVolume);
}


interface IClock {
  modelIndex: number;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
}

interface IOven {
  modelIndex: number;
  buttonStates: Map<MODEL_TYPE, IButtonState>;
}

function makeClockFn () : IClock {
  return { modelIndex: 0
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ [MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, {curr: 0, last: 0}]]) };
}

function makeOvenFn () : IOven {
  return { modelIndex: 1
         , buttonStates: new Map<MODEL_TYPE, IButtonState>([ [MODEL_TYPE.OVEN_CANCEL_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON, {curr: 0, last: 0}]
                                                           , [MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, {curr: 0, last: 0}]]) };
}

interface IState {
  globalTime: number;
  simulationTime: number;
  simulating: SIMULATION_TYPE;
  inputData: Map<string,IInputData>;
  entities: IEntity[];
  storedEntities: IEntity[];
  models: IModel[];
  clock: IClock;
  oven: IOven;
  // latestEntityId: number;
  segments: ISegment[]
  entitiesToVelocitySegments: Map<IEntity, ISegment>;
}

function saveEntitiesToStoredEntities (state : IState) {
  state.storedEntities.length = 0;
  for (let entity of state.entities) {
    state.storedEntities.push(cloneEntity(entity));
  }
}

function restoreEntitiesFromStoredEntities (state : IState) {
  const oldEntityIds = new Set();
  for (let entity of state.entities) {
    oldEntityIds.add(entity.id);
  }
  for (let entity of state.storedEntities) {
    if (oldEntityIds.has(entity.id)) {
      oldEntityIds.delete(entity.id);
    }
  }
  for (let entity of state.entities) {
    if (oldEntityIds.has(entity.id)) {
      Vec3.set(entity.pos, 0,-100, 0); // XXX(JULIAN): This is the most terrible way to get rid of something (by hiding it underground instead of deleting...)
      // One slightly better thing would be to make it invisible, but we can't do that quite yet because entities don't have visibility
      state.storedEntities.push(entity);
    }
  }
  state.entities = state.storedEntities;
  state.storedEntities = [];
  saveEntitiesToStoredEntities(state);
}

function getInitialState () : IState {
  let statefile = process.argv[2];
  if (statefile !== undefined) {
    return deserializeStateObject(JSON.parse(FS.readFileSync(statefile, 'utf8')));
  } else {

    // Initial Objects
    const oven = makeOvenModelFn(Vec3.fromValues(0.008,0,-1.466), Quat.create());
    const clock = makeClockModelFn(Vec3.fromValues(-1.485,0,-0.686), Quat.fromValues(0,0.7071068,0,0.7071068));

    const DEFAULT_STATE : IState = {
      globalTime: 0
    , simulationTime: 0
    , simulating: SIMULATION_TYPE.PAUSED
    , inputData: new Map<string,IInputData>()
    , entities: [ makeEntityFn(Vec3.fromValues(0,0.5,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,0.8,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,1,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,1.5,0), Quat.create(), Vec3.create(), new Uint8Array([0x00,0x33,0xFF,0xEE]), ENTITY_TYPE.CLONER) ]
              //  ]
    , storedEntities: []
    , models: [clock, oven]
    , clock: makeClockFn()
    , oven: makeOvenFn()
    // , latestEntityId: 0
    , segments: []
              //    makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0xFF,0x00,0xFF])) // green
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0x00,0xFF,0xFF])) // blue
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xFF])) // red
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0x00,0xFF]))
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0xFF,0xFF]))
              //  ]
    , entitiesToVelocitySegments: new Map<IEntity, ISegment>()
    };
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



// TODO(JULIAN): Optimize, maybe with a spatial hash
function getClosestEntityToPoint (pt : IVector3) : IEntity|null {
  const entities = STATE.entities;
  let closest = null;
  let sqrDistance = Infinity;
  for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
    let entity = entities[entityIndex];
    let currSqrDist = Vec3.sqrDist(entity.pos, pt);
    if (currSqrDist < sqrDistance) {
      sqrDistance = currSqrDist; 
      closest = entity;
    }
  }
  return closest;
}

function pickUpEntityWithController (entity: IEntity, controller: IController) {
  controller.pickedUpObject = entity;
  controller.pickedUpObjectTime = new Date();
  Vec3.transformQuat(/*out*/controller.pickedUpObjectOffset
                    , Vec3.sub(/*out*/controller.pickedUpObjectOffset
                              , entity.pos, controller.pos)
                    , Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                    , controller.rot));

  Quat.mul(/*out*/controller.pickedUpObjectRotOffset
          , Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                      , controller.rot), entity.rot);
}

function getPosRotForSubObj (outPos : IVector3, outRot : IQuaternion, model : IModel, modelId : MODEL_TYPE) {
  Quat.mul(/*out*/outRot
          , model.rot, model.children.get(modelId).rot);
  Vec3.add(/*out*/outPos
          , model.pos, Vec3.transformQuat(/*out*/_tempVec
                                         , model.children.get(modelId).pos, model.rot));
}

function doProcessClockInput () {
  const buttonTypes = [MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON, MODEL_TYPE.CLOCK_RESET_STATE_BUTTON, MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON, MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON];
  let doIntersect = {};
  buttonTypes.forEach((type) => { doIntersect[type] = false; });
  for (let [client, inputData] of STATE.inputData) {
      let controllers = inputData.controllers;
      for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
        let controller = controllers[controllerIndex];
        for (let type of buttonTypes) {
          getPosRotForSubObj(_tempVec, _tempQuat, STATE.models[STATE.clock.modelIndex], type);
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
      Quat.copy(/*out*/STATE.models[STATE.clock.modelIndex].children.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_FLIPPED_ROT);
    } else {
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.models[STATE.clock.modelIndex].children.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
    }
  }

  const stepFwdState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_SINGLE_STEP_BUTTON); 
  if (stepFwdState.curr === 1 && stepFwdState.last === 0) {
      STATE.simulating = SIMULATION_TYPE.FWD_ONE;
      Quat.copy(/*out*/STATE.models[STATE.clock.modelIndex].children.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
  }

  const freezeStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_FREEZE_STATE_BUTTON); 
  if (freezeStateState.curr === 1 && freezeStateState.last === 0) {
      STATE.simulationTime = 0;
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.models[STATE.clock.modelIndex].children.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
      saveEntitiesToStoredEntities(STATE);
  }

  const resetStateState = STATE.clock.buttonStates.get(MODEL_TYPE.CLOCK_RESET_STATE_BUTTON); 
  if (resetStateState.curr === 1 && resetStateState.last === 0) {
      STATE.simulationTime = 0;
      STATE.simulating = SIMULATION_TYPE.PAUSED;
      Quat.copy(/*out*/STATE.models[STATE.clock.modelIndex].children.get(MODEL_TYPE.CLOCK_PLAY_PAUSE_BUTTON).rot, CLOCK_BUTTON_BASE_ROT);
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
          getPosRotForSubObj(_tempVec, _tempQuat, STATE.models[STATE.oven.modelIndex], type);
          if (doVolumesOverlap(controller.pos, controller.interactionVolume
                              , _tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 })) {
            doIntersect[type] = true;
          }
        }
      }
  }


  const objectsInOven = [];
  const ovenModel = STATE.models[STATE.oven.modelIndex];
  Vec3.add(/*out*/_tempVec
          , ovenModel.pos, Vec3.transformQuat(/*out*/_tempVec
                                             , Vec3.fromValues(0, 0.364, 0.039), ovenModel.rot));

  const entities = STATE.entities;
  for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
    let entity = entities[entityIndex];
    if (doVolumesOverlap(entity.pos, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
                        , /*oven Center*/_tempVec, <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.4 })) {
        objectsInOven.push(entity);
    }
  }
  STATE.models[STATE.oven.modelIndex].children.get(MODEL_TYPE.OVEN_PROJECTION_SPACE).visible = (objectsInOven.length > 0);

  for (let type of buttonTypes) {
    const state = STATE.oven.buttonStates.get(type);
    state.curr = doIntersect[type]? 1 : 0;
  }

  const cancelState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_CANCEL_BUTTON); 
  if (cancelState.curr === 1 && cancelState.last === 0) {
    // if (STATE.simulating === SIMULATION_TYPE.PAUSED) {
    //   STATE.simulating = SIMULATION_TYPE.FWD_CONT;
    //   Quat.copy(/*out*/STATE.models[STATE.oven.modelIndex].children.get(MODEL_TYPE.oven_PLAY_PAUSE_BUTTON).rot, oven_BUTTON_FLIPPED_ROT);
    // } else {
    //   STATE.simulating = SIMULATION_TYPE.PAUSED;
    //   Quat.copy(/*out*/STATE.models[STATE.oven.modelIndex].children.get(MODEL_TYPE.oven_PLAY_PAUSE_BUTTON).rot, oven_BUTTON_BASE_ROT);
    // }
  }

  const stepBackState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_BACK_BUTTON); 
  if (stepBackState.curr === 1 && stepBackState.last === 0) {

  }

  const stepForwardState = STATE.oven.buttonStates.get(MODEL_TYPE.OVEN_SINGLE_STEP_FORWARD_BUTTON); 
  if (stepForwardState.curr === 1 && stepForwardState.last === 0) {

  }

  for (let type of buttonTypes) {
    const state = STATE.oven.buttonStates.get(type);
    state.last = state.curr; 
  }
}

function doProcessControllerInput () {
  let objectPoints = new Map<IEntity, Array<IController>>();
  for (let [client, inputData] of STATE.inputData) {
      let controllers = inputData.controllers;
      for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
        let controller = controllers[controllerIndex];

        // if (controller.action0.curr) {
        //   STATE.simulating = true;
        // } else if (!controller.action0.curr && controller.action0.last) {
        //   STATE.simulating = false;
        // }
        if (controller.grab.curr && !controller.grab.last) {
          let closestEntity = getClosestEntityToPoint(controller.pos);
          if (closestEntity != null && doesControllerOverlapObject(controller, closestEntity)) {
            if (closestEntity.type == ENTITY_TYPE.CLONER) {
              // let clonedObject = makeEntityFn(Vec3.clone(closestEntity.pos), Quat.clone(closestEntity.rot), Vec3.clone(closestEntity.vel), new Uint8Array(closestEntity.color), ENTITY_TYPE.DEFAULT);
              let clonedObject = makeEntityFn(Vec3.clone(closestEntity.pos), Quat.clone(closestEntity.rot), Vec3.clone(closestEntity.vel), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT);
              console.log(clonedObject);
              STATE.entities.push(clonedObject);
              pickUpEntityWithController(clonedObject, controller);
            } else {
              pickUpEntityWithController(closestEntity, controller);
            }
          }
        }

        if (!controller.grab.curr) {
          controller.pickedUpObject = null;
        } else if (controller.pickedUpObject != null) {
          // objectPoints

          if (!objectPoints.has(controller.pickedUpObject)) {
            objectPoints.set(controller.pickedUpObject, []);
          }
          objectPoints.get(controller.pickedUpObject).push(controller);
        }
        controller.grab.last = controller.grab.curr; // So that we can grab things
        controller.action0.last = controller.action0.curr;
      }
  }

  for (let [entity, controllerList] of objectPoints) {
    controllerList.sort((a, b) => a.pickedUpObjectTime.getTime() - b.pickedUpObjectTime.getTime()); // ascending order, so earlier time is earlier
    if (controllerList.length > 0) {
      let controller = controllerList[0];
      Vec3.add(/*out*/controller.pickedUpObject.pos
              , controller.pos, Vec3.transformQuat(/*out*/controller.pickedUpObject.pos
                                                  , controller.pickedUpObjectOffset, controller.rot));

      Quat.mul(/*out*/controller.pickedUpObject.rot, controller.rot, controller.pickedUpObjectRotOffset);
    }
    if (controllerList.length > 1) {
      let controller = controllerList[1];
      Vec3.sub(/*out*/entity.vel, controller.pos, entity.pos);
      Vec3.transformQuat(/*out*/entity.vel, entity.vel, Quat.invert(/*out*/_tempQuat, entity.rot));

      // if (!STATE.entitiesToVelocitySegments.has(entity)) {
      //   let segment = makeSegmentFn(entity.pos, Vec3.clone(controller.pos), new Uint8Array([0x00,0x00,0xFF,0xFF]));
      //   STATE.segments.push(segment);
      //   STATE.entitiesToVelocitySegments.set(entity, segment);
      //   console.log("Make Seg");
      // }
      // Vec3.copy(/*out*/STATE.entitiesToVelocitySegments.get(entity).end, controller.pos);
    }
  }


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

    doProcessClockInput();
    doProcessOvenInput();
    doProcessControllerInput();

    if (STATE.simulating === SIMULATION_TYPE.FWD_ONE || STATE.simulating === SIMULATION_TYPE.FWD_CONT) {
      const entities = STATE.entities;
      for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        let entity = entities[entityIndex];
        Vec3.scaleAndAdd(entity.pos, entity.pos, Vec3.transformQuat(_tempVec, entity.vel, entity.rot), 1/FPS); // pos = pos + vel * dt_in_units_per_sec
      }
      STATE.simulationTime += 1/FPS;
    }
    if (STATE.simulating === SIMULATION_TYPE.FWD_ONE) {
      STATE.simulating = SIMULATION_TYPE.PAUSED;
    }


    // TRANSFER STATE
    sendSimulationTimeFn(STATE.simulationTime).then(() => {
      Promise.each(STATE.models, (model) => { return sendModelPositionRotationScaleVisibilityFn(model); }).then(() => {
        Promise.each(STATE.entities, (entity) => { return sendEntityPositionRotationVelocityColorFn(entity); }).then(() => {
        // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          let avatarStuffToSend = [];
          for (let remoteClient of STATE.inputData.keys()) {
            for (let [client, inputData] of STATE.inputData) {
              if (remoteClient !== client) {
                avatarStuffToSend.push({destination: remoteClient, data: inputData})
              }
            }
          }


          Promise.each(avatarStuffToSend, (destAndInputData) => { return sendAvatarInfoFn(destAndInputData.destination, destAndInputData.data); }).then(() => {
            let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          });


          // Promise.each(STATE.segments, (segment) => { return sendSegmentFn(segment); }).then(() => {
          //   let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
          // });

          // console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
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
    console.log("HI!");
    inputData.set(client, { headset: makeHeadsetFn()
                          , controllers: [ makeControllerFn()
                                         , makeControllerFn() ]});
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