import {MESSAGE_TYPE} from './protocol'
import * as Protocol from './protocol'
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
const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)

const NETWORK = DGRAM.createSocket('udp4');



function sendFn (message : Buffer, messageLength: number, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, messageLength, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
}

let _currSeqId = 0;
function sendEntityPosition (obj : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionMsg(_sendBuffer, 0, MESSAGE_TYPE.Position, _currSeqId, obj.id, obj.pos);
  _currSeqId++;
  sendFn(_sendBuffer, messageLength, callback);
}

function sendEntityPositionRotation (entity : IEntity, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithPositionRotationMsg(_sendBuffer, 0, MESSAGE_TYPE.PositionRotation, _currSeqId, entity.id, entity.pos, entity.rot);
  _currSeqId++;
  sendFn(_sendBuffer, messageLength, callback);
}

function sendSegment (segment : ISegment, callback : () => (err: any, bytes: number) => void) {
  const messageLength = Protocol.fillBufferWithSegmentMsg(_sendBuffer, 0, MESSAGE_TYPE.Segment, _currSeqId, segment.id, segment.start, segment.end, segment.color);
  _currSeqId++;
  sendFn(_sendBuffer, messageLength, callback);
}

const sendEntityPositionFn = Promise.promisify(sendEntityPosition);
const sendEntityPositionRotationFn = Promise.promisify(sendEntityPositionRotation);
const sendSegmentFn = Promise.promisify(sendSegment);

let _latestEntityId = 0;
function makeEntityFn (pos : IVector3, rot: IQuaternion, type : ENTITY_TYPE) : IEntity {
  return <IEntity>{
    type: type
  , id: _latestEntityId++
  , pos: pos
  , rot: rot
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

interface IGrabState {
  curr: 0|1;
  last: 0|1;
}

interface IController {
   pos : IVector3;
   interactionVolume: IInteractionVolume;
   rot: IQuaternion;
   grab: IGrabState;
   pickedUpObject: IEntity|null;
   pickedUpObjectOffset: IVector3;
   pickedUpObjectRotOffset: IVector3;
}

function makeControllerFn () : IController {
  return { pos: Vec3.create()
         , interactionVolume: <IInteractionVolume>{ type: VOLUME_TYPE.SPHERE, radius: 0.075 }
         , rot: Quat.create()
         , grab: { curr: 0, last: 0 }
         , pickedUpObject: null
         , pickedUpObjectOffset: Vec3.create()
         , pickedUpObjectRotOffset: Quat.create() };
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


interface IState {
  time: number;
  controllerData: Map<string,IController[]>;
  entities: IEntity[]
  segments: ISegment[]
}

let _interval : null|NodeJS.Timer = null;
const _sendBuffer = Buffer.allocUnsafe(1024);
const FPS = 90;
const STATE : IState = { time: 0
                       , controllerData: new Map<string,IController[]>()
                       , entities: [ makeEntityFn(Vec3.fromValues(0,0.5,0), Quat.create(), ENTITY_TYPE.DEFAULT)
                                   , makeEntityFn(Vec3.fromValues(0,0.8,0), Quat.create(), ENTITY_TYPE.DEFAULT)
                                   , makeEntityFn(Vec3.fromValues(0,1,0), Quat.create(), ENTITY_TYPE.DEFAULT)
                                   , makeEntityFn(Vec3.fromValues(0,1.5,0), Quat.create(), ENTITY_TYPE.CLONER) ]
                       , segments: [ makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0xFF,0x00,0xFF]))
                                   , makeSegmentFn(Vec3.create(), Vec3.create(), new Uint8Array([0x00,0x00,0xFF,0xFF]))
                                                                                                                                //a   
                                   , makeSegmentFn(Vec3.fromValues(0,0.5,0), Vec3.fromValues(0,1.5,0), new Uint8Array([0x00,0xFF,0xFF,0x00]))] };

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
  Vec3.transformQuat(/*out*/controller.pickedUpObjectOffset
                    , Vec3.sub(/*out*/controller.pickedUpObjectOffset
                              , entity.pos, controller.pos)
                    , Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                    , controller.rot));

  Quat.mul(/*out*/controller.pickedUpObjectRotOffset
          , entity.rot, Quat.invert(/*out*/controller.pickedUpObjectRotOffset
                                      , controller.rot));
}


const _tempQuat = Quat.create();
const _tempVec = Vec3.create();

NETWORK.bind(undefined, undefined, () => {
  NETWORK.setBroadcast(true);
  _interval = setInterval(() => {

    let DEBUG_start_sending = process.hrtime();

    for (let [client, controllers] of STATE.controllerData) {
        for (let controllerIndex = 0; controllerIndex < controllers.length; controllerIndex++) {
          let controller = controllers[controllerIndex];
          if (controller.grab.curr && !controller.grab.last) {
            let closestEntity = getClosestEntityToPoint(controller.pos);
            if (closestEntity != null && doesControllerOverlapObject(controller, closestEntity)) {
              if (closestEntity.type == ENTITY_TYPE.CLONER) {
                let clonedObject = makeEntityFn(Vec3.clone(closestEntity.pos), Quat.clone(closestEntity.rot), ENTITY_TYPE.DEFAULT);
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
            Vec3.copy(STATE.segments[0].start, controller.pos);
            Vec3.add(STATE.segments[0].end, controller.pickedUpObjectOffset, controller.pos);

            Vec3.add(/*out*/controller.pickedUpObject.pos
                    , controller.pos, Vec3.transformQuat(/*out*/controller.pickedUpObject.pos
                                                        , controller.pickedUpObjectOffset, controller.rot));

            Vec3.copy(STATE.segments[1].start, controller.pos);
            Vec3.copy(STATE.segments[1].end, controller.pickedUpObject.pos);

            Quat.mul(/*out*/controller.pickedUpObject.rot, controller.pickedUpObjectRotOffset, controller.rot);
          }
        }
    }

    Promise.each(STATE.entities, (entity) => { return sendEntityPositionRotationFn(entity); }).then(() => {
      // let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      Promise.each(STATE.segments, (segment) => { return sendSegmentFn(segment); }).then(() => {
        let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      });
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
  let controllerData = STATE.controllerData;
  if (!controllerData.has(client)) {
    console.log("HI!");
    controllerData.set(client, [ makeControllerFn()
                               , makeControllerFn()
                               ]);
  }

  controllerData.get(client)[0].grab.last = controllerData.get(client)[0].grab.curr;
  controllerData.get(client)[1].grab.last = controllerData.get(client)[1].grab.curr;

  let offset = 0;
  Vec3.set(/*out*/controllerData.get(client)[0].pos
          , message.readFloatLE(offset)
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4));
  Quat.set(/*out*/controllerData.get(client)[0].rot
          , message.readFloatLE(offset+=4) // w
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4));
  controllerData.get(client)[0].grab.curr = <0|1>message.readUInt8(offset+=4);

  Vec3.set(/*out*/controllerData.get(client)[1].pos
          , message.readFloatLE(offset+=1)
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4));
  Quat.set(/*out*/controllerData.get(client)[1].rot
          , message.readFloatLE(offset+=4) // w
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4)
          , message.readFloatLE(offset+=4));
  controllerData.get(client)[1].grab.curr = <0|1>message.readUInt8(offset+=4);
});

process.on('SIGINT', () => {
  clearInterval(_interval);
  setTimeout(() => {
    process.exit();
  }, 1000);
});