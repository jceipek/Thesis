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
  DEFAULT = 0,
  CLONER = 1
}

const PORT = 8053;
// const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)
const HOST = '169.254.255.255'; // Subnet broadcast
// const HOST = '192.168.1.255'; // Subnet broadcast
// const HOST = '127.0.0.1';

const NETWORK = DGRAM.createSocket('udp4');

const UNIT_VECTOR3 = Vec3.fromValues(1,1,1);

let _interval : null|NodeJS.Timer = null;
const _sendBuffer = Buffer.allocUnsafe(1024);
const FPS = 90;
// const FPS = 30;
let _latestEntityId = 0;
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
    const messageLength = Protocol.fillBufferWithPositionRotationScaleModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleModel, _currSeqId, controller0.id, MODEL_TYPE.BASIC_CONTROLLER, controller0.pos, controller0.rot, UNIT_VECTOR3);
    sendTargetFn(_sendBuffer, messageLength, host, port, () => {
      const messageLength = Protocol.fillBufferWithPositionRotationScaleModelMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationScaleModel, _currSeqId, controller1.id, MODEL_TYPE.BASIC_CONTROLLER, controller1.pos, controller1.rot, UNIT_VECTOR3);
      sendTargetFn(_sendBuffer, messageLength, host, port, callback);
    });
  });
}

function sendEntityPositionRotationVelocityColor (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationVelocityColorMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotationVelocityColor, _currSeqId, entity.id, entity.pos, entity.rot, entity.vel, entity.color);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

function sendSegment (segment : ISegment, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSegmentMsg(_sendBuffer, 0, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  sendBroadcastFn(_sendBuffer, messageLength, callback);
}

const sendEntityPositionFn = Promise.promisify(sendEntityPosition);
const sendEntityPositionRotationFn = Promise.promisify(sendEntityPositionRotation);
const sendEntityPositionRotationVelocityColorFn = Promise.promisify(sendEntityPositionRotationVelocityColor);
const sendSegmentFn = Promise.promisify(sendSegment);
const sendAvatarInfoFn = Promise.promisify(sendAvatarInfo);

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
  action1: IButtonState;
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
         , action1: { curr: 0, last: 0 }
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

function makeRecordingFn (objectId) : IRecording {
  return { objectId: objectId
         , positions: []
         , posDeltas: []
         , rotDeltas: []
         , rotations: []
         , playbackIndex: 0};
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


interface IRecording {
  objectId: number;
  positions: IVector3[];
  posDeltas: IVector3[];
  rotDeltas: IQuaternion[];
  rotations: IQuaternion[];
  playbackIndex: number;
}

interface IState {
  time: number;
  simulating: boolean;
  inputData: Map<string,IInputData>;
  entities: IEntity[];
  models: IModel[];
  // latestEntityId: number;
  segments: ISegment[];
  idsTorecordings: Map<string,IRecording>; // Object Id -> Recording
  entitiesToVelocitySegments: Map<IEntity, ISegment>;
}

function getInitialState () : IState {
  let statefile = process.argv[2];
  if (statefile !== undefined) {
    return deserializeStateObject(JSON.parse(FS.readFileSync(statefile, 'utf8')));
  } else {
    const DEFAULT_STATE : IState = {
      time: 0
    , simulating: false
    , inputData: new Map<string,IInputData>()
    , entities: [ makeEntityFn(Vec3.fromValues(0,0.5,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,0.8,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,1,0), Quat.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xEE]), ENTITY_TYPE.DEFAULT)
                , makeEntityFn(Vec3.fromValues(0,1.5,0), Quat.create(), Vec3.create(), new Uint8Array([0x00,0x33,0xFF,0xEE]), ENTITY_TYPE.CLONER) ]
              //  ]
    , models: []
    // , latestEntityId: 0
    , segments: []
              //    makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0xFF,0x00,0xFF])) // green
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0x00,0xFF,0xFF])) // blue
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0x00,0x00,0xFF])) // red
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0x00,0xFF]))
              //  , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0xFF,0xFF,0xFF,0xFF]))
              //  ]
    , idsTorecordings: new Map<string,IRecording>() // Object Id -> Recording
    , entitiesToVelocitySegments: new Map<IEntity, ISegment>()
    };
    return DEFAULT_STATE;
  }
}


// let DEBUG_START_POS = Vec3.fromValues(0, 0.5, 0);
// let DEBUG_END_POS = Vec3.fromValues(0, 1, 0);
// // let DEBUG_END_POS = Vec3.fromValues(1, 0.2, 0);

// STATE.controllerData.set('DEBUG', [makeControllerFn()]);
// Vec3.copy(STATE.controllerData.get('DEBUG')[0].pos, DEBUG_START_POS);
// // STATE.controllerData.get('DEBUG')[0].grab.curr = 1;
// STATE.controllerData.get('DEBUG')[0].grab.curr = 0;

// let DEBUG_START_ROT = Quat.setAxisAngle(Quat.create(), Vec3.fromValues(0,0,1), 0);
// let DEBUG_ROT = Quat.setAxisAngle(Quat.create(), Vec3.fromValues(0,0,1), Math.PI/2);

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


function doProcessControllerInput () {
  let objectPoints = new Map<IEntity, Array<IController>>();
  for (let [client, inputData] of STATE.inputData) {
      let controllers = inputData.controllers;
      for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
        let controller = controllers[controllerIndex];
        if (controller.action0.curr) {
          STATE.simulating = true;
        } else if (!controller.action0.curr && controller.action0.last) {
          STATE.simulating = false;
        }
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

        if (controller.action1.curr && controller.pickedUpObject != null) {
          let objectToRecord = controller.pickedUpObject;
          if (!STATE.idsTorecordings.has(objectToRecord.id.toString())) {
            STATE.idsTorecordings.set(objectToRecord.id.toString(), makeRecordingFn(objectToRecord.id));
          }
          let myRecording = STATE.idsTorecordings.get(objectToRecord.id.toString());
          if (!controller.action1.last) {
            // just started recording anew, so kill existing recording
            myRecording.positions.length = 0;
            myRecording.rotations.length = 0;
            myRecording.posDeltas.length = 0;
            myRecording.rotDeltas.length = 0;
            myRecording.playbackIndex = 0;

            myRecording.positions.push(Vec3.clone(objectToRecord.pos)); // Basis
            myRecording.rotations.push(Quat.clone(objectToRecord.rot)); // Basis
          } else if (myRecording.positions.length > 0) {
            myRecording.posDeltas.push(Vec3.clone(Vec3.transformQuat(_tempVec,
                                                                     Vec3.sub(_tempVec,
                                                                              objectToRecord.pos,
                                                                              myRecording.positions[myRecording.positions.length - 1]),
                                                                     Quat.invert(_tempQuat,
                                                                                 objectToRecord.rot))));
            
            // myRecording.rotDeltas.push(Quat.clone(Quat.mul(_tempQuat,
            //                                                objectToRecord.rot,
            //                                                Quat.invert(_tempQuat, 
            //                                                            myRecording.rotations[myRecording.rotations.length - 1]))));
            myRecording.rotDeltas.push(Quat.clone(Quat.mul(_tempQuat,
                                                           Quat.invert(_tempQuat, 
                                                                       myRecording.rotations[myRecording.rotations.length - 1]),
                                                           objectToRecord.rot)));

            myRecording.positions.push(Vec3.clone(objectToRecord.pos));
            myRecording.rotations.push(Quat.clone(objectToRecord.rot));
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
        controller.action1.last = controller.action1.curr;
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
    // if (controllerList.length > 1) {
    //   let controller = controllerList[1];
    //   Vec3.sub(/*out*/entity.vel, controller.pos, entity.pos);
    //   Vec3.transformQuat(/*out*/entity.vel, entity.vel, Quat.invert(/*out*/_tempQuat, entity.rot));

    //   // if (!STATE.entitiesToVelocitySegments.has(entity)) {
    //   //   let segment = makeSegmentFn(entity.pos, Vec3.clone(controller.pos), new Uint8Array([0x00,0x00,0xFF,0xFF]));
    //   //   STATE.segments.push(segment);
    //   //   STATE.entitiesToVelocitySegments.set(entity, segment);
    //   //   console.log("Make Seg");
    //   // }
    //   // Vec3.copy(/*out*/STATE.entitiesToVelocitySegments.get(entity).end, controller.pos);
    // }
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

    doProcessControllerInput();

    if (STATE.simulating) {
      const entities = STATE.entities;

      simulate:
      for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        let entity = entities[entityIndex];
        for (let [client, inputData] of STATE.inputData) {
            let controllers = inputData.controllers;
            for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
              let controller = controllers[controllerIndex];
              if (controller.pickedUpObject === entity) {
                continue simulate;
              }
            }
        }
        // Vec3.scaleAndAdd(entity.pos, entity.pos, Vec3.transformQuat(_tempVec, entity.vel, entity.rot), 1/FPS); // pos = pos + vel * dt_in_units_per_sec
        if (STATE.idsTorecordings.has(entity.id.toString())) {
          let currRecording = STATE.idsTorecordings.get(entity.id.toString());
          // if (currRecording.playbackIndex < currRecording.positions.length-1) {
          if (currRecording.playbackIndex < currRecording.posDeltas.length) {
            // Vec3.add(entity.pos, entity.pos, Vec3.sub(_tempVec, currRecording.positions[currRecording.playbackIndex+1], currRecording.positions[currRecording.playbackIndex]));
            // Quat.conjugate()

            Vec3.add(entity.pos,
                     entity.pos,
                     Vec3.transformQuat(_tempVec, currRecording.posDeltas[currRecording.playbackIndex], entity.rot));
            Quat.mul(entity.rot, entity.rot, currRecording.rotDeltas[currRecording.playbackIndex]);
            // Vec3.copy(entity.pos, currRecording.positions[currRecording.playbackIndex]);
            // Quat.copy(entity.rot, currRecording.rotations[currRecording.playbackIndex]);
            currRecording.playbackIndex++;
          } else {
            currRecording.playbackIndex = 0;
          }
        }
      }
    }


    // TRANSFER STATE 
    Promise.each(STATE.entities, (entity) => { return sendEntityPositionRotationVelocityColorFn(entity); }).then(() => {
      // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;

      let stuffToSend = [];
      for (let remoteClient of STATE.inputData.keys()) {
        for (let [client, inputData] of STATE.inputData) {
          if (remoteClient !== client) {
            stuffToSend.push({destination: remoteClient, data: inputData})
          }
        }
      }


      Promise.each(stuffToSend, (destAndInputData) => { return sendAvatarInfoFn(destAndInputData.destination, destAndInputData.data); }).then(() => {
        let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      });


      // Promise.each(STATE.segments, (segment) => { return sendSegmentFn(segment); }).then(() => {
      //   let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      // });

      // console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
    });

    STATE.time += 1/FPS;
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
  inputData.get(client).controllers[0].action1.curr = <0|1>message.readUInt8(offset+=1, true);

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
  inputData.get(client).controllers[1].action1.curr = <0|1>message.readUInt8(offset+=1, true);
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

  FS.writeFile(`persistentState${(new Date()).getTime()}.json`, serializeState({_latestEntityId: _latestEntityId, STATE: STATE}), function(err) {
    if(err) {
        return console.log(err);
    }

    console.log("Saved State to JSON");
    setTimeout(() => {
      process.exit();
    }, 1000);
  });
});