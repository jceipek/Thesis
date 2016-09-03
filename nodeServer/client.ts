import * as Promise from "bluebird"
import * as DGRAM from 'dgram'
import { Vector3, sqrDistance3D, distance3D, subtract3D, add3D } from './vector'

interface Entity {
  id: number;
  pos: Vector3;
}

interface InteractionVolume {
  type: VOLUME_TYPE;
}

interface SphereInteractionVolume extends InteractionVolume {
  radius: number;
}

const enum MESSAGE_TYPE {
  Unknown = -1,
  Default = 0x00,
  Position = 0x01
}

const enum VOLUME_TYPE {
  SPHERE
}

const PORT = 8053;
const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)

const NETWORK = DGRAM.createSocket('udp4');



function sendFn (message : Buffer, callback : (err: any, bytes: number) => void) {
  NETWORK.send(message, 0, message.length, PORT, HOST, callback); // NOTE(Julian): Buffer can't be reused until callback has been called
};

let _currSeqId = 0;
function sendObjectPosition (obj : Entity, callback : () => (err: any, bytes: number) => void) {
  fillBufferWithPosMsg(_sendBuffer, 0, MESSAGE_TYPE.Position, _currSeqId, obj.id, obj.pos);
  _currSeqId++;
  sendFn(_sendBuffer, callback);
};

const sendObjectPositionFn = Promise.promisify(sendObjectPosition);

function fillBufferWithPosMsg (buf : Buffer, offset : number, msgType : MESSAGE_TYPE, seqNumber : number, objectId : number, position : Vector3) {
  // XXX(Julian): Assuming Little Endian, but this may be a big mistake!!!
  offset = buf.writeInt8(msgType, offset, true);
  offset = buf.writeInt32LE(seqNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(position.x, offset, true);
  offset = buf.writeFloatLE(position.y, offset, true);
  offset = buf.writeFloatLE(position.z, offset, true);
}

let _time = 0;

const _sendBuffer = Buffer.allocUnsafe(23);

let _latestEntityId = 0;
function makeObjectFn (pos : Vector3) : Entity {
  return <Entity>{
    pos: pos
  , id: _latestEntityId++
  , interactionVolume: { type: VOLUME_TYPE.SPHERE, radius: 0.05 }
  };
};

function makeControllerFn () {
  return { pos: {x: 0, y: 0, z: 0}
         , interactionVolume: { type: VOLUME_TYPE.SPHERE, radius: 0.075 }
         , rot: {x: 0, y: 0, z: 0, w: 1}
         , grab: { curr: 0, last: 0 }
         , pickedUpObject: null
         , pickedUpObjectOffset: {x: 0, y: 0, z: 0} };
}


const FPS = 90;

// let triangleWave = function (t, halfPeriod) {
//   return (2/halfPeriod) * (t - halfPeriod * (t/halfPeriod + 1/2)) * Math.pow(-1, (t/halfPeriod) + 1/2);
// }

function doVolumesOverlap (posA : Vector3, volA : InteractionVolume, posB : Vector3, volB : InteractionVolume) {
  if (volA.type == VOLUME_TYPE.SPHERE && volB.type == VOLUME_TYPE.SPHERE) {
    return sqrDistance3D(posA,posB) <= ((<SphereInteractionVolume>volA).radius + (<SphereInteractionVolume>volB).radius) * 
                                       ((<SphereInteractionVolume>volA).radius + (<SphereInteractionVolume>volB).radius);
  }
  return false;
}

function doesControllerOverlapObject (controller, obj) {
  return doVolumesOverlap(controller.pos, controller.interactionVolume
                         , obj.pos, obj.interactionVolume);
}


const STATE = { controllerData: {}, entities: [ makeObjectFn({x:0,y:0.5,z:0})
                                              , makeObjectFn({x:0,y:0.8,z:0})
                                              , makeObjectFn({x:0,y:1,z:0})
                                              , makeObjectFn({x:0,y:1.5,z:0}) ] };
// remote.address + ':' + remote.port

// let _x = 0;
// let _dir = 1;
// let _gridSize = 0.1;
let _interval;

// NETWORK.bind(function() {
NETWORK.bind(PORT, HOST, function() {
  NETWORK.setBroadcast(true);
  // NETWORK.setMulticastTTL(128);

  _interval = setInterval(function() {

    // let DEBUG_start = process.hrtime();

    // _x += _dir*1/FPS;
    // if (_x >= 1 || _x <= 0) {
    //   _dir = -_dir;
    // }

    let objects = STATE.entities;
    for (let objIndex = 0; objIndex < objects.length; objIndex++) {

      for (let client in STATE.controllerData) {
        if (STATE.controllerData.hasOwnProperty(client)) {
          for (let controllerIndex = 0; controllerIndex < STATE.controllerData[client].length; controllerIndex++) {
            let controller = STATE.controllerData[client][controllerIndex];
            if (controller.grab.curr && !controller.grab.last && doesControllerOverlapObject(controller, objects[objIndex])) {
              controller.pickedUpObject = objects[objIndex];
              controller.pickedUpObjectOffset = subtract3D(objects[objIndex].pos, controller.pos);
            }

            if (!controller.grab.curr) {
              controller.pickedUpObject = null;
            } else if (controller.pickedUpObject != null) {
              controller.pickedUpObject.pos = add3D(controller.pos, controller.pickedUpObjectOffset);
            }
          }
        }
      }

      // pos.x = (Math.sin(_time*0.1+objectId/2*Math.cos(_time*0.1+objectId/2)))*30;//objectId * 2;
      // pos.y = Math.sin(_time*0.1+objectId/2)*30;
      // pos.z = Math.cos(_time*0.1+objectId/2)*30;

      // pos.x = 0;//objectId * 2;
      // pos.y = Math.floor((1.5+_x)/_gridSize)*_gridSize;// Math.sin(_time);
      // pos.z = 0;

      // pos.x = _POS.x;
      // pos.y = _POS.y;
      // pos.z = _POS.z;
    }

    let DEBUG_start_sending = process.hrtime();

    Promise.each(objects, (x) => { return sendObjectPositionFn(x); }).then(function () {
      let elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
    });

    _time += 1/FPS;
  }, 1000/FPS);
});

NETWORK.on('listening', function () {
    let address = NETWORK.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

// Grab and store controller data
NETWORK.on('message', function (message : Buffer, remote) {
  let client = remote.address + ':' + remote.port;
  let controllerData = STATE.controllerData;
  if (!controllerData.hasOwnProperty(client)) {
    controllerData[client] = [ makeControllerFn()
                             , makeControllerFn()
                             ];
  }

  controllerData[client][0].grab.last = controllerData[client][0].grab.curr;
  controllerData[client][1].grab.last = controllerData[client][1].grab.curr;

  let offset = 0;
  controllerData[client][0].pos.x = message.readFloatLE(offset);
  controllerData[client][0].pos.y = message.readFloatLE(offset+=4);
  controllerData[client][0].pos.z = message.readFloatLE(offset+=4);
  controllerData[client][0].rot.x = message.readFloatLE(offset+=4);
  controllerData[client][0].rot.y = message.readFloatLE(offset+=4);
  controllerData[client][0].rot.z = message.readFloatLE(offset+=4);
  controllerData[client][0].rot.w = message.readFloatLE(offset+=4);
  controllerData[client][0].grab.curr = message.readUInt8(offset+=4);

  controllerData[client][1].pos.x = message.readFloatLE(offset+=1);
  controllerData[client][1].pos.y = message.readFloatLE(offset+=4);
  controllerData[client][1].pos.z = message.readFloatLE(offset+=4);
  controllerData[client][1].rot.x = message.readFloatLE(offset+=4);
  controllerData[client][1].rot.y = message.readFloatLE(offset+=4);
  controllerData[client][1].rot.z = message.readFloatLE(offset+=4);
  controllerData[client][1].rot.w = message.readFloatLE(offset+=4);
  controllerData[client][1].grab.curr = message.readUInt8(offset+=4);
});

process.on('SIGINT', function () {
  clearInterval(_interval);
  setTimeout(function () {
    process.exit();
  }, 1000);
});